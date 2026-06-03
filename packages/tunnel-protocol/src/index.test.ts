import { describe, it, expect } from "vitest";
import {
  FrameType,
  decodeFrame,
  encodeData,
  encodeOpen,
  encodeClose,
  encodeSignals,
  encodeState,
  encodeError,
  encodePing,
  type SerialConfigWire,
} from "./index.js";

const CONFIG: SerialConfigWire = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
};

describe("tunnel-protocol", () => {
  it("DATA round-trips an arbitrary byte payload", () => {
    const payload = new Uint8Array([0, 1, 2, 0x18, 0xff, 0x42]);
    const frame = decodeFrame(encodeData(payload));
    expect(frame.type).toBe(FrameType.DATA);
    if (frame.type === FrameType.DATA) {
      expect(Array.from(frame.payload)).toEqual(Array.from(payload));
    }
  });

  it("DATA empty payload survives the round trip", () => {
    const frame = decodeFrame(encodeData(new Uint8Array(0)));
    expect(frame.type).toBe(FrameType.DATA);
    if (frame.type === FrameType.DATA) {
      expect(frame.payload.byteLength).toBe(0);
    }
  });

  it("OPEN carries the SerialConfigWire verbatim", () => {
    const frame = decodeFrame(encodeOpen(CONFIG));
    expect(frame.type).toBe(FrameType.OPEN);
    if (frame.type === FrameType.OPEN) {
      expect(frame.config).toEqual(CONFIG);
    }
  });

  it("CLOSE has no payload", () => {
    const buf = encodeClose();
    expect(buf.byteLength).toBe(1);
    expect(decodeFrame(buf).type).toBe(FrameType.CLOSE);
  });

  it("SIGNALS preserves all flags", () => {
    const signals = { dtr: true, rts: false, brk: true, cts: false, dsr: true, dcd: false, ri: true };
    const frame = decodeFrame(encodeSignals(signals));
    expect(frame.type).toBe(FrameType.SIGNALS);
    if (frame.type === FrameType.SIGNALS) {
      expect(frame.signals).toEqual(signals);
    }
  });

  it("STATE open=true carries the config", () => {
    const frame = decodeFrame(encodeState(true, CONFIG));
    expect(frame.type).toBe(FrameType.STATE);
    if (frame.type === FrameType.STATE) {
      expect(frame.open).toBe(true);
      expect(frame.config).toEqual(CONFIG);
    }
  });

  it("STATE open=false has no config", () => {
    const frame = decodeFrame(encodeState(false));
    expect(frame.type).toBe(FrameType.STATE);
    if (frame.type === FrameType.STATE) {
      expect(frame.open).toBe(false);
      expect(frame.config).toBeUndefined();
    }
  });

  it("ERROR round-trips code + message", () => {
    const frame = decodeFrame(encodeError("BUSY", "Another client is already connected"));
    expect(frame.type).toBe(FrameType.ERROR);
    if (frame.type === FrameType.ERROR) {
      expect(frame.code).toBe("BUSY");
      expect(frame.message).toBe("Another client is already connected");
    }
  });

  it("PING has no payload", () => {
    const buf = encodePing();
    expect(buf.byteLength).toBe(1);
    expect(decodeFrame(buf).type).toBe(FrameType.PING);
  });

  it("rejects an empty buffer", () => {
    expect(() => decodeFrame(new Uint8Array(0))).toThrow();
  });

  it("rejects an unknown frame type", () => {
    expect(() => decodeFrame(new Uint8Array([0xff]))).toThrow(/Unknown frame type/);
  });
});
