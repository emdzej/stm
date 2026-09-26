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

/** Maximum accepted baud rate. Generous upper bound (most USB-UART bridges
 * top out at 12 Mbaud); exists to reject garbage, not to police hardware. */
export const MAX_BAUD_RATE = 20_000_000;

/** WebSocket subprotocol the tunnel speaks. The server always selects it. */
export const SUBPROTOCOL = "stm.v1";
/** Prefix for the subprotocol entry carrying the auth token. Browsers can't
 * set an `Authorization` header on a WebSocket, and a `?token=` query string
 * leaks into logs / history — `Sec-WebSocket-Protocol` is the one header a
 * browser lets us populate. The token is base64url-encoded so any string
 * fits the RFC 6455 token grammar. */
export const TOKEN_SUBPROTOCOL_PREFIX = "stm.token.";

function base64UrlEncode(s: string): string {
  let bin = "";
  for (const b of enc.encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Subprotocol list a client should offer: always `stm.v1`, plus the token
 * entry when a token is configured. */
export function clientSubprotocols(token?: string): string[] {
  return token ? [SUBPROTOCOL, TOKEN_SUBPROTOCOL_PREFIX + base64UrlEncode(token)] : [SUBPROTOCOL];
}

/** Extract the token from an offered subprotocol list, if present. */
export function tokenFromSubprotocols(protocols: Iterable<string>): string | undefined {
  for (const p of protocols) {
    if (!p.startsWith(TOKEN_SUBPROTOCOL_PREFIX)) continue;
    try {
      return base64UrlDecode(p.slice(TOKEN_SUBPROTOCOL_PREFIX.length));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseJson(body: Uint8Array): unknown {
  return JSON.parse(dec.decode(body));
}

/** Validate an untrusted serial config. JSON from the wire is otherwise a
 * bare cast — this is what stands between a client and `new SerialPort()`. */
export function validateSerialConfig(v: unknown): SerialConfigWire {
  if (!isObject(v)) throw new Error("config must be an object");
  const { baudRate, dataBits, stopBits, parity, flowControl } = v;
  if (
    typeof baudRate !== "number" ||
    !Number.isInteger(baudRate) ||
    baudRate < 1 ||
    baudRate > MAX_BAUD_RATE
  ) {
    throw new Error(`invalid baudRate: ${String(baudRate)}`);
  }
  if (dataBits !== 7 && dataBits !== 8) throw new Error(`invalid dataBits: ${String(dataBits)}`);
  if (stopBits !== 1 && stopBits !== 2) throw new Error(`invalid stopBits: ${String(stopBits)}`);
  if (parity !== "none" && parity !== "even" && parity !== "odd") {
    throw new Error(`invalid parity: ${String(parity)}`);
  }
  if (flowControl !== "none" && flowControl !== "hardware") {
    throw new Error(`invalid flowControl: ${String(flowControl)}`);
  }
  return { baudRate, dataBits, stopBits, parity, flowControl };
}

const SIGNAL_KEYS = ["dtr", "rts", "brk", "cts", "dsr", "dcd", "ri"] as const;

/** Keep only known boolean signal keys; reject non-objects. */
export function validateSignals(v: unknown): SerialSignalsWire {
  if (!isObject(v)) throw new Error("signals must be an object");
  const out: SerialSignalsWire = {};
  for (const k of SIGNAL_KEYS) {
    const val = v[k];
    if (val === undefined) continue;
    if (typeof val !== "boolean") throw new Error(`invalid signal ${k}: ${String(val)}`);
    out[k] = val;
  }
  return out;
}

function prefix(type: FrameTypeValue, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(1 + body.length);
  out[0] = type;
  out.set(body, 1);
  return out;
}

function jsonBody(obj: unknown): Uint8Array {
  return enc.encode(JSON.stringify(obj));
}

export function encodeData(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return prefix(FrameType.DATA, bytes);
}

export function encodeOpen(config: SerialConfigWire): Uint8Array<ArrayBuffer> {
  return prefix(FrameType.OPEN, jsonBody(config));
}

export function encodeClose(): Uint8Array<ArrayBuffer> {
  return Uint8Array.of(FrameType.CLOSE);
}

export function encodeSignals(signals: SerialSignalsWire): Uint8Array<ArrayBuffer> {
  return prefix(FrameType.SIGNALS, jsonBody(signals));
}

export function encodeState(open: boolean, config?: SerialConfigWire): Uint8Array<ArrayBuffer> {
  return prefix(FrameType.STATE, jsonBody({ open, config }));
}

export function encodeError(code: string, message: string): Uint8Array<ArrayBuffer> {
  return prefix(FrameType.ERROR, jsonBody({ code, message }));
}

export function encodePing(): Uint8Array<ArrayBuffer> {
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
      return { type, config: validateSerialConfig(parseJson(body)) };
    case FrameType.CLOSE:
      return { type };
    case FrameType.SIGNALS:
      return { type, signals: validateSignals(parseJson(body)) };
    case FrameType.STATE: {
      const parsed = parseJson(body);
      if (!isObject(parsed) || typeof parsed.open !== "boolean") {
        throw new Error("invalid STATE frame");
      }
      return {
        type,
        open: parsed.open,
        config: parsed.config === undefined ? undefined : validateSerialConfig(parsed.config),
      };
    }
    case FrameType.ERROR: {
      const parsed = parseJson(body);
      if (!isObject(parsed) || typeof parsed.code !== "string" || typeof parsed.message !== "string") {
        throw new Error("invalid ERROR frame");
      }
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
