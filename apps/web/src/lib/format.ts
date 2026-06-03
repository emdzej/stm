/** Decode bytes for an ASCII-style stream view.
 * Printable ASCII (0x20–0x7E) and \t\r\n pass through; other bytes
 * become "·" so non-printables stay visible without breaking the layout.
 */
export function decodeForAscii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0a || b === 0x0d || b === 0x09) {
      out += String.fromCharCode(b);
    } else if (b >= 0x20 && b <= 0x7e) {
      out += String.fromCharCode(b);
    } else {
      out += "·";
    }
  }
  return out;
}

/** Parse a hex-byte string like "DE AD BE EF" / "deadbeef" / "DE-AD-BE-EF" into bytes.
 * Whitespace, dashes, colons, and 0x prefixes are tolerated.
 * Throws on odd nibble count or non-hex characters.
 */
export function parseHex(input: string): Uint8Array {
  const cleaned = input.replace(/0x/gi, "").replace(/[\s:_-]+/g, "");
  if (cleaned.length === 0) return new Uint8Array(0);
  if (cleaned.length % 2 !== 0) throw new Error("Hex input must have an even number of digits");
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) throw new Error("Hex input contains non-hex characters");
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return out;
}

export type LineEnding = "none" | "cr" | "lf" | "crlf" | "nul";

export function lineEndingBytes(ending: LineEnding): Uint8Array {
  switch (ending) {
    case "cr":
      return new Uint8Array([0x0d]);
    case "lf":
      return new Uint8Array([0x0a]);
    case "crlf":
      return new Uint8Array([0x0d, 0x0a]);
    case "nul":
      return new Uint8Array([0x00]);
    case "none":
      return new Uint8Array(0);
  }
}

const ASCII_ENC = new TextEncoder();
export function encodeAscii(text: string): Uint8Array {
  return ASCII_ENC.encode(text);
}

/** Format a row of bytes as classic xxd: "00000010  de ad be ef ...  |gutter|" */
export function formatHexRow(offset: number, row: Uint8Array): string {
  const off = offset.toString(16).padStart(8, "0");
  let hex = "";
  let ascii = "";
  for (let i = 0; i < 16; i++) {
    if (i === 8) hex += " ";
    if (i < row.length) {
      hex += " " + row[i].toString(16).padStart(2, "0");
      const b = row[i];
      ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";
    } else {
      hex += "   ";
    }
  }
  return `${off} ${hex}  ${ascii}`;
}
