import { describe, it, expect } from "vitest";
import { compileMacro } from "./macros";

describe("compileMacro", () => {
  it("returns empty bytes for an empty payload", () => {
    expect(compileMacro("").byteLength).toBe(0);
  });

  it("passes through plain ASCII verbatim", () => {
    expect(Array.from(compileMacro("AT"))).toEqual([0x41, 0x54]);
  });

  it("interprets \\r \\n \\t \\0", () => {
    expect(Array.from(compileMacro("\\r\\n\\t\\0"))).toEqual([0x0d, 0x0a, 0x09, 0x00]);
  });

  it("interprets a literal backslash", () => {
    expect(Array.from(compileMacro("\\\\"))).toEqual([0x5c]);
  });

  it("interprets \\xNN hex bytes", () => {
    expect(Array.from(compileMacro("\\x1b[2J"))).toEqual([
      0x1b,
      0x5b,
      0x32,
      0x4a,
    ]);
  });

  it("uppercase and lowercase hex are both accepted", () => {
    expect(Array.from(compileMacro("\\xDE\\xad"))).toEqual([0xde, 0xad]);
  });

  it("keeps the backslash when \\xNN has bad hex", () => {
    // \xZZ is not valid → backslash stays, then "x", "Z", "Z" follow
    const bytes = Array.from(compileMacro("\\xZZ"));
    expect(bytes[0]).toBe(0x5c); // backslash
    expect(bytes[1]).toBe(0x78); // x
  });

  it("a real AT command compiles to AT+CSQ\\r", () => {
    expect(Array.from(compileMacro("AT+CSQ\\r"))).toEqual([
      0x41,
      0x54,
      0x2b,
      0x43,
      0x53,
      0x51,
      0x0d,
    ]);
  });
});
