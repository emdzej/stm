/**
 * Wire format: first byte = FrameType, remainder = payload.
 * Control frames (OPEN/STATE/ERROR) carry UTF-8 JSON.
 * DATA / SIGNALS / PING carry raw bytes.
 * WebSocket already provides message framing, so no length prefix is needed.
 */

export const FrameType = {
  DATA: 0x01,
  OPEN: 0x02,
  CLOSE: 0x03,
  SIGNALS: 0x04,
  STATE: 0x05,
  ERROR: 0x06,
  PING: 0x07,
} as const;
export type FrameTypeValue = (typeof FrameType)[keyof typeof FrameType];

export interface SerialConfigWire {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware";
}

export interface SerialSignalsWire {
  dtr?: boolean;
  rts?: boolean;
  brk?: boolean;
  cts?: boolean;
  dsr?: boolean;
  dcd?: boolean;
  ri?: boolean;
}

export type DecodedFrame =
  | { type: typeof FrameType.DATA; payload: Uint8Array }
  | { type: typeof FrameType.OPEN; config: SerialConfigWire }
  | { type: typeof FrameType.CLOSE }
  | { type: typeof FrameType.SIGNALS; signals: SerialSignalsWire }
  | { type: typeof FrameType.STATE; open: boolean; config?: SerialConfigWire }
  | { type: typeof FrameType.ERROR; code: string; message: string }
  | { type: typeof FrameType.PING };

const enc = new TextEncoder();
const dec = new TextDecoder();

function prefix(type: FrameTypeValue, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + body.length);
  out[0] = type;
  out.set(body, 1);
  return out;
}

function jsonBody(obj: unknown): Uint8Array {
  return enc.encode(JSON.stringify(obj));
}

export function encodeData(bytes: Uint8Array): Uint8Array {
  return prefix(FrameType.DATA, bytes);
}

export function encodeOpen(config: SerialConfigWire): Uint8Array {
  return prefix(FrameType.OPEN, jsonBody(config));
}

export function encodeClose(): Uint8Array {
  return Uint8Array.of(FrameType.CLOSE);
}

export function encodeSignals(signals: SerialSignalsWire): Uint8Array {
  return prefix(FrameType.SIGNALS, jsonBody(signals));
}

export function encodeState(open: boolean, config?: SerialConfigWire): Uint8Array {
  return prefix(FrameType.STATE, jsonBody({ open, config }));
}

export function encodeError(code: string, message: string): Uint8Array {
  return prefix(FrameType.ERROR, jsonBody({ code, message }));
}

export function encodePing(): Uint8Array {
  return Uint8Array.of(FrameType.PING);
}

export function decodeFrame(buf: Uint8Array): DecodedFrame {
  if (buf.length === 0) throw new Error("Empty frame");
  const type = buf[0] as FrameTypeValue;
  const body = buf.subarray(1);
  switch (type) {
    case FrameType.DATA:
      return { type, payload: body };
    case FrameType.OPEN:
      return { type, config: JSON.parse(dec.decode(body)) as SerialConfigWire };
    case FrameType.CLOSE:
      return { type };
    case FrameType.SIGNALS:
      return { type, signals: JSON.parse(dec.decode(body)) as SerialSignalsWire };
    case FrameType.STATE: {
      const parsed = JSON.parse(dec.decode(body)) as {
        open: boolean;
        config?: SerialConfigWire;
      };
      return { type, open: parsed.open, config: parsed.config };
    }
    case FrameType.ERROR: {
      const parsed = JSON.parse(dec.decode(body)) as { code: string; message: string };
      return { type, code: parsed.code, message: parsed.message };
    }
    case FrameType.PING:
      return { type };
    default: {
      const unknown = type as number;
      throw new Error(`Unknown frame type 0x${unknown.toString(16)}`);
    }
  }
}
