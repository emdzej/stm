import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { SerialPort } from "serialport";
import { WebSocketServer, type WebSocket } from "ws";
import {
  FrameType,
  decodeFrame,
  encodeData,
  encodeError,
  encodeState,
  type SerialConfigWire,
} from "@emdzej/stm-tunnel-protocol";

export interface TunnelOptions {
  serialPath?: string;
  execCommand?: string;
  defaultBaud: number;
  host: string;
  port: number;
  token?: string;
  allowedOrigin?: string;
  tls?: { cert: Buffer; key: Buffer };
  verbose: boolean;
}

/** Internal abstraction over either a SerialPort or a PTY-hosted process.
 * Both look the same to the rest of the server. */
interface Device {
  write(buf: Buffer): void;
  setSignals?(signals: { dtr?: boolean; rts?: boolean; brk?: boolean }): void;
  close(): Promise<void>;
}

export async function startTunnel(opts: TunnelOptions): Promise<void> {
  const httpServer = opts.tls
    ? createHttpsServer({ cert: opts.tls.cert, key: opts.tls.key })
    : createHttpServer();

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!authorize(req, opts)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  let active: WebSocket | null = null;

  wss.on("connection", (ws) => {
    if (active) {
      ws.send(encodeError("BUSY", "Another client is already connected"));
      ws.close();
      return;
    }
    active = ws;
    if (opts.verbose) console.log("[tunnel] client connected");

    let device: Device | null = null;

    ws.on("message", async (data) => {
      const buf =
        data instanceof Buffer
          ? new Uint8Array(data)
          : new Uint8Array(data as ArrayBuffer);
      let frame;
      try {
        frame = decodeFrame(buf);
      } catch (err) {
        ws.send(encodeError("BAD_FRAME", (err as Error).message));
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
    });

    ws.on("close", async () => {
      if (opts.verbose) console.log("[tunnel] client disconnected");
      await closeDevice();
      active = null;
    });

    async function openDevice(config: SerialConfigWire): Promise<void> {
      try {
        device = opts.execCommand
          ? await openPty(opts.execCommand, ws)
          : await openSerial(opts.serialPath!, config, ws);
        ws.send(encodeState(true, config));
        if (opts.verbose) {
          if (opts.execCommand) {
            console.log(`[tunnel] pty opened: ${opts.execCommand}`);
          } else {
            console.log(
              `[tunnel] serial opened ${opts.serialPath} @ ${config.baudRate}`,
            );
          }
        }
      } catch (err) {
        ws.send(encodeError("OPEN_FAILED", (err as Error).message));
        device = null;
      }
    }

    async function closeDevice(): Promise<void> {
      if (!device) return;
      await device.close().catch(() => {});
      device = null;
      ws.send(encodeState(false));
    }
  });

  httpServer.listen(opts.port, opts.host, () => {
    const scheme = opts.tls ? "wss" : "ws";
    console.log(`[tunnel] listening on ${scheme}://${opts.host}:${opts.port}`);
    if (opts.execCommand) {
      console.log(`[tunnel] mode: --exec ${opts.execCommand} (PTY)`);
    } else {
      console.log(
        `[tunnel] mode: serial ${opts.serialPath} (default baud ${opts.defaultBaud})`,
      );
    }
    if (opts.token) console.log("[tunnel] token authentication enabled");
  });
}

async function openSerial(
  path: string,
  config: SerialConfigWire,
  ws: WebSocket,
): Promise<Device> {
  const port = new SerialPort({
    path,
    baudRate: config.baudRate,
    dataBits: config.dataBits,
    stopBits: config.stopBits,
    parity: config.parity,
  });
  port.on("data", (chunk: Buffer) => {
    ws.send(encodeData(new Uint8Array(chunk)));
  });
  port.on("error", (err) => {
    ws.send(encodeError("SERIAL_ERR", err.message));
  });
  await new Promise<void>((resolve, reject) => {
    port.once("open", resolve);
    port.once("error", reject);
  });
  return {
    write: (buf) => port.write(buf),
    setSignals: (s) => port.set({ dtr: s.dtr, rts: s.rts, brk: s.brk }),
    close: () =>
      new Promise<void>((resolve) => {
        if (!port.isOpen) return resolve();
        port.close(() => resolve());
      }),
  };
}

async function openPty(command: string, ws: WebSocket): Promise<Device> {
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
  const parts = command.trim().split(/\s+/);
  const [cmd, ...args] = parts;
  if (!cmd) throw new Error("--exec command is empty");

  // node-pty crashes on env keys with `undefined` values — process.env *spec*
  // says all values are strings, but TypeScript's typing is permissive, and a
  // few platform tools (Node debugger inspector, some shells) actually
  // surface undefined keys here. Filter to be safe.
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") cleanEnv[k] = v;
  }
  const cwd = process.env.HOME && process.env.HOME.length > 0 ? process.env.HOME : process.cwd();

  let proc;
  try {
    proc = pty.spawn(cmd, args, {
      cols: 80,
      rows: 24,
      name: "xterm-256color",
      cwd,
      env: cleanEnv,
    });
  } catch (err) {
    // Dump the full error to the server log so diagnostics aren't lost in
    // the WebSocket round-trip.
    // eslint-disable-next-line no-console
    console.error("[tunnel] node-pty.spawn failed:", err);
    // eslint-disable-next-line no-console
    console.error("[tunnel]   command:", cmd, args);
    // eslint-disable-next-line no-console
    console.error("[tunnel]   cwd:", cwd);
    // eslint-disable-next-line no-console
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
  proc.onData((data) => {
    ws.send(encodeData(enc.encode(data)));
  });
  proc.onExit(({ exitCode, signal }) => {
    ws.send(
      encodeError(
        "EXEC_EXIT",
        `Process exited (code=${exitCode}${signal ? `, signal=${signal}` : ""})`,
      ),
    );
  });
  return {
    write: (buf) => proc.write(buf.toString("utf8")),
    // BRK doesn't translate cleanly to a PTY signal; ignore.
    setSignals: () => {},
    close: async () => {
      try {
        proc.kill();
      } catch {
        // already dead
      }
    },
  };
}

function authorize(
  req: { headers: Record<string, string | string[] | undefined>; url?: string },
  opts: TunnelOptions,
): boolean {
  if (opts.allowedOrigin) {
    const origin = req.headers.origin;
    const originStr = Array.isArray(origin) ? origin[0] : origin;
    if (originStr !== opts.allowedOrigin) return false;
  }
  if (!opts.token) return true;

  const header = req.headers.authorization;
  const headerStr = Array.isArray(header) ? header[0] : header;
  if (headerStr === `Bearer ${opts.token}`) return true;

  if (req.url) {
    const url = new URL(req.url, "http://localhost");
    if (url.searchParams.get("token") === opts.token) return true;
  }
  return false;
}
