import Zmodem, {
  type Sentry,
  type ZmodemSession,
  type ZmodemOffer,
} from "zmodem.js/src/zmodem_browser.js";

/**
 * ZMODEM transfer state, mirrored as $state for the UI to bind to. The
 * receive path is fully implemented (auto-detected when the device runs
 * `sz`); send is stubbed pending a separate `rz`-initiated flow.
 */
export type XferState =
  | { kind: "idle" }
  | { kind: "offered"; filename: string; size: number; offer: ZmodemOffer }
  | { kind: "receiving"; filename: string; size: number; received: number }
  | { kind: "complete"; filename: string; bytes: number }
  | { kind: "error"; message: string };

export const xfer = $state<{ state: XferState }>({ state: { kind: "idle" } });

/** Create a Sentry that splits the byte stream into terminal data vs ZMODEM
 * frames. Callers wire `toTerminal` to xterm.write and `send` to bridge.write.
 *
 * Returns a `consume(bytes)` function — feed every byte received from the
 * device through it. ZMODEM frames are intercepted and trigger the receive
 * flow; everything else passes through to the terminal unchanged. */
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
      } else {
        // Send sessions are triggered when the device runs `rz` — would land
        // here. Not wired up yet: TODO send-from-our-side flow.
        detection.deny();
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

/** Accept the currently-offered file. Streams chunks to a Blob and triggers
 * a download when complete. */
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
    // Clear after a few seconds so the dialog auto-dismisses.
    setTimeout(() => {
      if (xfer.state.kind === "complete") xfer.state = { kind: "idle" };
    }, 4000);
  } catch (err) {
    xfer.state = { kind: "error", message: (err as Error).message };
  }
}

/** Skip the offered file — the sender will see this and move on to the next
 * (or end the batch). */
export function skipOffer(): void {
  if (xfer.state.kind !== "offered") return;
  xfer.state.offer.skip();
  xfer.state = { kind: "idle" };
}

export function dismissXfer(): void {
  xfer.state = { kind: "idle" };
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
