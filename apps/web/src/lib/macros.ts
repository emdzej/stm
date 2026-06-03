/**
 * Compile a macro payload string to raw bytes. Supports these escape
 * sequences (everything else passes through as Latin-1):
 *
 *   \r  \n  \t  \0   common control chars
 *   \\           literal backslash
 *   \xNN         two-hex-digit byte (e.g. `\x1b` for ESC)
 *
 * Unrecognised escapes leave the backslash in place.
 */
export function compileMacro(payload: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < payload.length; i++) {
    const ch = payload[i];
    if (ch !== "\\" || i + 1 >= payload.length) {
      bytes.push(payload.charCodeAt(i) & 0xff);
      continue;
    }
    const next = payload[i + 1];
    switch (next) {
      case "r":
        bytes.push(0x0d);
        i++;
        break;
      case "n":
        bytes.push(0x0a);
        i++;
        break;
      case "t":
        bytes.push(0x09);
        i++;
        break;
      case "0":
        bytes.push(0x00);
        i++;
        break;
      case "\\":
        bytes.push(0x5c);
        i++;
        break;
      case "x": {
        if (i + 3 < payload.length) {
          const hex = payload.slice(i + 2, i + 4);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            bytes.push(parseInt(hex, 16));
            i += 3;
            break;
          }
        }
        // Bad / truncated \xNN — keep the backslash and let the rest pass through.
        bytes.push(0x5c);
        break;
      }
      default:
        // Unknown escape — keep the backslash, let the next char fall through
        // on the next loop iteration.
        bytes.push(0x5c);
        break;
    }
  }
  return new Uint8Array(bytes);
}
