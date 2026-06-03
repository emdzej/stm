import Zmodem, {
  type Sentry,
  type ZmodemSession,
  type ZmodemOffer,
} from "zmodem.js/src/zmodem_browser.js";
import { bridge } from "./serial-bridge.svelte";

/**
 * ZMODEM transfer state, mirrored as $state for the UI to bind to.
 *
 * Send flow:
 *   1. User picks file(s) → state becomes "sending-handshake".
 *   2. We send `rz\r` to the device so its `rz` program runs.
 *   3. Device replies with ZRINIT → Sentry detects a send session.
 *   4. We invoke Zmodem.Browser.send_files() → state becomes "sending"
 *      with live byte progress.
 *
 * Receive flow:
 *   1. Device runs `sz file` → sends ZRQINIT → Sentry detects receive session.
 *   2. Session emits an "offer" event → state becomes "offered".
 *   3. User accepts → state becomes "receiving" → blob downloaded on complete.
 */
export type XferState =
  | { kind: "idle" }
  | { kind: "sending-handshake" }
  | { kind: "sending"; filename: string; size: number; sent: number }
  | { kind: "offered"; filename: string; size: number; offer: ZmodemOffer }
  | { kind: "receiving"; filename: string; size: number; received: number }
  | { kind: "complete"; filename: string; bytes: number }
  | { kind: "error"; message: string };

interface XferRoot {
  state: XferState;
  /** Files queued by the user that are waiting for the device to start `rz`. */
  pendingSend: File[];
}

export const xfer = $state<XferRoot>({ state: { kind: "idle" }, pendingSend: [] });

const HANDSHAKE_TIMEOUT_MS = 10_000;

/** Create a Sentry that splits the byte stream into terminal data vs ZMODEM
 * frames. Callers wire `toTerminal` to xterm.write and `send` to bridge.write.
 *
 * Returns a `consume(bytes)` function — feed every byte received from the
 * device through it. ZMODEM frames are intercepted; everything else passes
 * through to the terminal unchanged. */
export function createZmodemPipe(opts: {
  toTerminal: (bytes: Uint8Array) => void;
  send: (bytes: Uint8Array) => void;
}): {
  consume: (bytes: Uint8Array) => void;
  destroy: () => void;
} {
  const sentry: Sentry = new Zmodem.Sentry({
    to_terminal: (out) => opts.toTerminal(toUint8Array(out)),
    sender: (out) => opts.send(toUint8Array(out)),
    on_retract: () => {
      xfer.state = { kind: "idle" };
    },
    on_detect: (detection) => {
      const session = detection.confirm();
      if (session.type === "receive") {
        void runReceive(session);
      } else if (session.type === "send") {
        if (xfer.pendingSend.length > 0) {
          const files = xfer.pendingSend;
          xfer.pendingSend = [];
          void runSend(session, files);
        } else {
          // The device started `rz` without our prompting — we don't have
          // a file ready. Abort cleanly so the device can move on.
          session.abort();
          xfer.state = { kind: "idle" };
        }
      }
    },
  });

  return {
    consume: (bytes) => {
      try {
        sentry.consume(bytes);
      } catch (err) {
        xfer.state = { kind: "error", message: (err as Error).message };
      }
    },
    destroy: () => {
      xfer.state = { kind: "idle" };
      xfer.pendingSend = [];
    },
  };
}

async function runReceive(session: ZmodemSession): Promise<void> {
  session.on("offer", (offerArg: unknown) => {
    const offer = offerArg as ZmodemOffer;
    const details = offer.get_details();
    xfer.state = {
      kind: "offered",
      filename: details.name,
      size: details.size,
      offer,
    };
  });
  try {
    await session.start();
  } catch (err) {
    xfer.state = { kind: "error", message: (err as Error).message };
  }
}

async function runSend(session: ZmodemSession, files: File[]): Promise<void> {
  xfer.state = {
    kind: "sending",
    filename: files[0].name,
    size: files[0].size,
    sent: 0,
  };
  try {
    await Zmodem.Browser.send_files(session, files, {
      on_progress: (file: File, _x: unknown, offset: number) => {
        if (xfer.state.kind === "sending" && xfer.state.filename === file.name) {
          xfer.state.sent = offset;
        }
      },
      on_file_complete: (file: File) => {
        // Roll the progress display onto the next file if any.
        const next = files[files.indexOf(file) + 1];
        if (next) {
          xfer.state = { kind: "sending", filename: next.name, size: next.size, sent: 0 };
        }
      },
    });
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const label = files.length === 1 ? files[0].name : `${files.length} files`;
    xfer.state = { kind: "complete", filename: label, bytes: totalBytes };
    setTimeout(() => {
      if (xfer.state.kind === "complete") xfer.state = { kind: "idle" };
    }, 4000);
  } catch (err) {
    xfer.state = { kind: "error", message: (err as Error).message };
  }
}

/** Kick off a ZMODEM send: queue the picked files, then send `rz\r` so the
 * device enters receive mode. The Sentry picks up the device's ZRINIT and
 * invokes the send pipeline. Times out if the device never responds. */
export function initiateSend(files: FileList | File[]): void {
  if (xfer.state.kind !== "idle") {
    return;
  }
  if (!bridge.activeConfig) {
    xfer.state = { kind: "error", message: "Not connected" };
    return;
  }
  const list = Array.from(files);
  if (list.length === 0) return;
  xfer.pendingSend = list;
  xfer.state = { kind: "sending-handshake" };
  void bridge.write(new TextEncoder().encode("rz\r")).catch((err) => {
    xfer.state = { kind: "error", message: (err as Error).message };
    xfer.pendingSend = [];
  });
  setTimeout(() => {
    if (xfer.state.kind === "sending-handshake") {
      xfer.state = {
        kind: "error",
        message:
          "Device didn't start ZMODEM receive within 10s. " +
          "Make sure `rz` is available on the remote shell.",
      };
      xfer.pendingSend = [];
    }
  }, HANDSHAKE_TIMEOUT_MS);
}

export async function acceptOffer(): Promise<void> {
  if (xfer.state.kind !== "offered") return;
  const { filename, size, offer } = xfer.state;
  xfer.state = { kind: "receiving", filename, size, received: 0 };

  const chunks: Uint8Array[] = [];
  offer.on("input", (payload: Uint8Array) => {
    chunks.push(new Uint8Array(payload));
    if (xfer.state.kind === "receiving") {
      xfer.state.received += payload.byteLength;
    }
  });

  try {
    await offer.accept();
    const blob = new Blob(chunks as BlobPart[]);
    downloadBlob(blob, filename);
    xfer.state = { kind: "complete", filename, bytes: blob.size };
    setTimeout(() => {
      if (xfer.state.kind === "complete") xfer.state = { kind: "idle" };
    }, 4000);
  } catch (err) {
    xfer.state = { kind: "error", message: (err as Error).message };
  }
}

export function skipOffer(): void {
  if (xfer.state.kind !== "offered") return;
  xfer.state.offer.skip();
  xfer.state = { kind: "idle" };
}

export function dismissXfer(): void {
  xfer.state = { kind: "idle" };
  xfer.pendingSend = [];
}

function toUint8Array(input: Uint8Array | number[]): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
