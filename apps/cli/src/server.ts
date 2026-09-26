import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { SerialPort } from "serialport";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import {
  FrameType,
  SUBPROTOCOL,
  decodeFrame,
  encodeData,
  encodeError,
  encodeState,
  type SerialConfigWire,
} from "@emdzej/stm-tunnel-protocol";
import { authorize, buildChildEnv, splitCommand, type AuthPolicy } from "./options.js";

export interface TunnelOptions {
  serialPath?: string;
  execCommand?: string;
  defaultBaud: number;
  host: string;
  port: number;
  auth: AuthPolicy;
  tls?: { cert: Buffer; key: Buffer };
  cleanEnv: boolean;
  verbose: boolean;
}

/** Largest inbound WebSocket message. Client frames are keystrokes, pasted
 * text or ZMODEM blocks (≤ 8 KiB); 1 MiB is plenty and caps memory per frame
 * (ws defaults to 100 MiB). */
const MAX_PAYLOAD = 1024 * 1024;
/** Pause the device when this many bytes are queued towards the client… */
const HIGH_WATER = 1024 * 1024;
/** …and resume once the queue drains below this. */
const LOW_WATER = 256 * 1024;
/** Ping interval; a client that misses one full interval is terminated so a
 * half-open connection can't hold the single client slot forever. */
const HEARTBEAT_MS = 30_000;

/** Internal abstraction over either a SerialPort or a PTY-hosted process.
 * Both look the same to the rest of the server. */
interface Device {
  write(buf: Buffer): void;
  setSignals?(signals: { dtr?: boolean; rts?: boolean; brk?: boolean }): void;
  pause(): void;
  resume(): void;
  close(): Promise<void>;
}

/** Sink the device pushes into. Handles backpressure and dead sockets. */
interface Sink {
  data(bytes: Uint8Array): void;
  error(code: string, message: string): void;
  /** The device ended on its own (e.g. PTY process exited). */
  ended(): void;
}

function send(ws: WebSocket, frame: Uint8Array, cb?: (err?: Error) => void): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(frame, cb);
}

export async function startTunnel(opts: TunnelOptions): Promise<void> {
  const onRequest = (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(426, { "Content-Type": "text/plain", Upgrade: "websocket" });
    res.end("stm-tunnel: WebSocket endpoint\n");
  };
  const httpServer = opts.tls
    ? createHttpsServer({ cert: opts.tls.cert, key: opts.tls.key }, onRequest)
    : createHttpServer(onRequest);

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD,
    // Always select stm.v1 when offered; the token entry is never echoed.
    handleProtocols: (protocols) => (protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
  });

  let warnedQueryToken = false;
  httpServer.on("upgrade", (req, socket, head) => {
    const result = authorize(req, opts.auth);
    if (!result.ok) {
      console.warn(`[tunnel] rejected ${req.socket.remoteAddress}: ${result.reason}`);
      const status = result.status === 401 ? "401 Unauthorized" : "403 Forbidden";
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }
    if (result.via === "query" && !warnedQueryToken) {
      warnedQueryToken = true;
      console.warn(
        "[tunnel] client sent the token in the URL query (legacy); it may end up in logs. Update the web app.",
      );
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  let active: WebSocket | null = null;

  wss.on("connection", (ws: WebSocket) => {
    if (active) {
      send(ws, encodeError("BUSY", "Another client is already connected"));
      ws.close();
      return;
    }
    active = ws;
    if (opts.verbose) console.log("[tunnel] client connected");

    let alive = true;
    ws.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        if (opts.verbose) console.log("[tunnel] client missed heartbeat; terminating");
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, HEARTBEAT_MS);

    let device: Device | null = null;
    let paused = false;
    /** Bumped on every open/close so callbacks from a device that has since
     * been closed (e.g. a killed PTY's onExit) can't clobber the current one. */
    let generation = 0;

    function makeSink(gen: number): Sink {
      const current = () => gen === generation;
      return {
        data(bytes) {
          if (!current()) return;
          send(ws, encodeData(bytes), () => {
            if (current() && paused && ws.bufferedAmount < LOW_WATER) {
              paused = false;
              device?.resume();
            }
          });
          if (!paused && ws.bufferedAmount > HIGH_WATER) {
            paused = true;
            device?.pause();
          }
        },
        error(code, message) {
          if (current()) send(ws, encodeError(code, message));
        },
        ended() {
          if (!current()) return;
          generation++;
          device = null;
          paused = false;
          send(ws, encodeState(false));
        },
      };
    }

    // Frames are handled strictly in order: reconfigure sends CLOSE+OPEN
    // back-to-back and those must not interleave.
    let queue: Promise<void> = Promise.resolve();
    ws.on("message", (data: RawData) => {
      queue = queue
        .then(() => handleMessage(data))
        .catch((err: unknown) => console.error("[tunnel] message handler failed:", err));
    });

    ws.on("close", () => {
      if (opts.verbose) console.log("[tunnel] client disconnected");
      clearInterval(heartbeat);
      queue = queue.then(() => closeDevice(false)).finally(() => {
        if (active === ws) active = null;
      });
    });

    ws.on("error", (err) => {
      console.error("[tunnel] websocket error:", err.message);
    });

    async function handleMessage(data: RawData): Promise<void> {
      const buf = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data;
      let frame;
      try {
        frame = decodeFrame(buf);
      } catch (err) {
        send(ws, encodeError("BAD_FRAME", (err as Error).message));
        return;
      }
      switch (frame.type) {
        case FrameType.OPEN:
          await openDevice(frame.config);
          break;
        case FrameType.CLOSE:
          await closeDevice();
          break;
        case FrameType.DATA:
          device?.write(Buffer.from(frame.payload));
          break;
        case FrameType.SIGNALS:
          device?.setSignals?.(frame.signals);
          break;
      }
    }

    async function openDevice(config: SerialConfigWire): Promise<void> {
      // A second OPEN without CLOSE used to leak the first device (extra
      // PTY process / locked port). Close it first.
      await closeDevice(false);
      if (ws.readyState !== WebSocket.OPEN) return;
      const sink = makeSink(++generation);
      try {
        device = opts.execCommand
          ? await openPty(opts.execCommand, opts.cleanEnv, sink)
          : await openSerial(opts.serialPath!, config, sink);
        send(ws, encodeState(true, config));
        if (opts.verbose) {
          if (opts.execCommand) {
            console.log(`[tunnel] pty opened: ${opts.execCommand}`);
          } else {
            console.log(`[tunnel] serial opened ${opts.serialPath} @ ${config.baudRate}`);
          }
        }
      } catch (err) {
        send(ws, encodeError("OPEN_FAILED", (err as Error).message));
        device = null;
      }
      // Client went away mid-open: don't leave the device dangling.
      if (ws.readyState !== WebSocket.OPEN) await closeDevice(false);
    }

    async function closeDevice(notify = true): Promise<void> {
      if (!device) return;
      const d = device;
      device = null;
      paused = false;
      generation++;
      await d.close().catch(() => {});
      if (notify) send(ws, encodeState(false));
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const scheme = opts.tls ? "wss" : "ws";
  const hostForUrl = opts.host.includes(":") ? `[${opts.host}]` : opts.host;
  console.log(`[tunnel] listening on ${scheme}://${hostForUrl}:${opts.port}`);
  if (opts.execCommand) {
    console.log(`[tunnel] mode: --exec ${opts.execCommand} (PTY${opts.cleanEnv ? ", clean env" : ""})`);
  } else {
    console.log(`[tunnel] mode: serial ${opts.serialPath} (default baud ${opts.defaultBaud})`);
  }
  console.log(
    `[tunnel] allowed origins: ${opts.auth.allowedOrigins.join(", ")} (plus clients sending no Origin)`,
  );
  if (!opts.auth.token) console.warn("[tunnel] WARNING: authentication disabled (--no-auth)");
}

async function openSerial(path: string, config: SerialConfigWire, sink: Sink): Promise<Device> {
  const port = new SerialPort({
    path,
    baudRate: config.baudRate,
    dataBits: config.dataBits,
    stopBits: config.stopBits,
    parity: config.parity,
    rtscts: config.flowControl === "hardware",
    autoOpen: false,
  });
  await new Promise<void>((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()));
  });
  port.on("data", (chunk: Buffer) => sink.data(new Uint8Array(chunk)));
  port.on("error", (err) => sink.error("SERIAL_ERR", err.message));
  port.on("close", (err?: { disconnected?: boolean }) => {
    // Unplugged device: tell the client instead of silently going quiet.
    if (err?.disconnected) {
      sink.error("SERIAL_ERR", "Serial device disconnected");
      sink.ended();
    }
  });
  return {
    write: (buf) => port.write(buf),
    setSignals: (s) => port.set({ dtr: s.dtr, rts: s.rts, brk: s.brk }),
    pause: () => port.pause(),
    resume: () => port.resume(),
    close: () =>
      new Promise<void>((resolve) => {
        if (!port.isOpen) return resolve();
        port.close(() => resolve());
      }),
  };
}

async function openPty(command: string, cleanEnv: boolean, sink: Sink): Promise<Device> {
  // Dynamic import keeps node-pty out of the load path for users who only
  // ever use --port. The postinstall on node-pty is a native build, which
  // pnpm may decline by default; the README documents how to allow it.
  let pty;
  try {
    pty = await import("node-pty");
  } catch (err) {
    throw new Error(
      "node-pty is not available — run `pnpm approve-builds node-pty && pnpm install` " +
        `to enable --exec mode. Underlying error: ${(err as Error).message}`,
    );
  }
  const [cmd, ...args] = splitCommand(command);
  if (!cmd) throw new Error("--exec command is empty");

  const env = buildChildEnv(process.env, cleanEnv);
  const cwd = process.env.HOME && process.env.HOME.length > 0 ? process.env.HOME : process.cwd();

  let proc;
  try {
    proc = pty.spawn(cmd, args, {
      cols: 80,
      rows: 24,
      name: "xterm-256color",
      cwd,
      env,
    });
  } catch (err) {
    // Dump the full error to the server log so diagnostics aren't lost in
    // the WebSocket round-trip.
    console.error("[tunnel] node-pty.spawn failed:", err);
    console.error("[tunnel]   command:", cmd, args);
    console.error("[tunnel]   cwd:", cwd);
    console.error("[tunnel]   node:", process.version, "arch:", process.arch, "platform:", process.platform);

    const msg = (err as Error).message;
    const detail = `Failed to spawn "${cmd}${args.length ? " " + args.join(" ") : ""}": ${msg}.`;
    if (/posix_spawnp/i.test(msg)) {
      throw new Error(
        `${detail} The native binding loaded but the OS rejected the spawn. ` +
          "On macOS this often means the node-pty prebuild's architecture " +
          "doesn't match Node's runtime architecture — try " +
          "`pnpm --filter @emdzej/stm-tunnel rebuild node-pty` to build " +
          "node-pty from source against your current Node binary. Also try a " +
          'simpler command first: `stm-tunnel --exec "echo hello"`.',
      );
    }
    if (/ENOENT|bindings|\.node/i.test(msg)) {
      throw new Error(
        `${detail} node-pty's native binding may be missing — run ` +
          "`pnpm approve-builds node-pty && pnpm install` to build it.",
      );
    }
    throw new Error(detail);
  }
  const enc = new TextEncoder();
  let exited = false;
  proc.onData((data) => sink.data(enc.encode(data)));
  proc.onExit(({ exitCode, signal }) => {
    exited = true;
    sink.error("EXEC_EXIT", `Process exited (code=${exitCode}${signal ? `, signal=${signal}` : ""})`);
    sink.ended();
  });
  return {
    write: (buf) => proc.write(buf.toString("utf8")),
    // BRK doesn't translate cleanly to a PTY signal; ignore.
    setSignals: () => {},
    pause: () => proc.pause(),
    resume: () => proc.resume(),
    close: async () => {
      if (exited) return;
      try {
        proc.kill();
      } catch {
        // already dead
      }
    },
  };
}
