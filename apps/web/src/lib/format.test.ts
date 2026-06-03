import { describe, it, expect } from "vitest";
import {
  decodeForAscii,
  encodeAscii,
  formatHexRow,
  lineEndingBytes,
  parseHex,
} from "./format";

describe("decodeForAscii", () => {
  it("passes through printable ASCII", () => {
    expect(decodeForAscii(new Uint8Array([0x48, 0x69]))).toBe("Hi");
  });
  it("preserves whitespace control bytes \\r, \\n, \\t", () => {
    expect(decodeForAscii(new Uint8Array([0x09, 0x0a, 0x0d]))).toBe("\t\n\r");
  });
  it("renders other control bytes as the middle dot", () => {
    expect(decodeForAscii(new Uint8Array([0x00, 0x01, 0x1f, 0x7f, 0x80, 0xff]))).toBe(
      "······",
    );
  });
  it("handles an empty input", () => {
    expect(decodeForAscii(new Uint8Array(0))).toBe("");
  });
});

describe("parseHex", () => {
  it("accepts space-separated hex pairs", () => {
    expect(Array.from(parseHex("DE AD BE EF"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });
  it("accepts unseparated hex", () => {
    expect(Array.from(parseHex("deadbeef"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });
  it("strips 0x prefixes and common separators", () => {
    expect(Array.from(parseHex("0xDE-0xAD_BE:EF"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });
  it("returns an empty array for empty input", () => {
    expect(parseHex("").byteLength).toBe(0);
  });
  it("throws on odd nibble count", () => {
    expect(() => parseHex("abc")).toThrow();
  });
  it("throws on non-hex characters", () => {
    expect(() => parseHex("zz")).toThrow();
  });
});

describe("lineEndingBytes", () => {
  it("none → empty", () => {
    expect(Array.from(lineEndingBytes("none"))).toEqual([]);
  });
  it("cr → 0x0D", () => {
    expect(Array.from(lineEndingBytes("cr"))).toEqual([0x0d]);
  });
  it("lf → 0x0A", () => {
    expect(Array.from(lineEndingBytes("lf"))).toEqual([0x0a]);
  });
  it("crlf → 0x0D 0x0A", () => {
    expect(Array.from(lineEndingBytes("crlf"))).toEqual([0x0d, 0x0a]);
  });
  it("nul → 0x00", () => {
    expect(Array.from(lineEndingBytes("nul"))).toEqual([0x00]);
  });
});

describe("encodeAscii", () => {
  it("encodes a UTF-8 string", () => {
    expect(Array.from(encodeAscii("Hi"))).toEqual([0x48, 0x69]);
  });
});

describe("formatHexRow", () => {
  it("formats a full 16-byte row", () => {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = 0x41 + i;
    const row = formatHexRow(0x10, bytes);
    expect(row).toMatch(/^00000010 /);
    // Ensures the gap between bytes 7 and 8 is two spaces (xxd-style group split)
    expect(row.includes("47 48  49 4a")).toBe(true);
    // ASCII gutter renders printable A..P
    expect(row.endsWith("ABCDEFGHIJKLMNOP")).toBe(true);
  });

  it("pads short rows so the ASCII gutter aligns", () => {
    const fullLen = formatHexRow(0, new Uint8Array(16).fill(0x41)).length;
    const shortLen = formatHexRow(0, new Uint8Array([0x41, 0x42])).length;
    // Short row's hex region is the same width — the only length difference
    // is the ASCII gutter at the end (16 vs 2 chars).
    expect(fullLen - shortLen).toBe(14);
  });
});
