import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { tokenFromSubprotocols } from "@emdzej/stm-tunnel-protocol";

/** Origins accepted when `--allowed-origin` isn't given: the hosted web app
 * plus local dev / preview servers on any port. Browsers don't apply CORS to
 * WebSockets, so without this check any page the user has open could drive
 * the tunnel. Requests with no Origin header (non-browser clients) are
 * allowed — a web page can't suppress the header. */
export const DEFAULT_ALLOWED_ORIGINS = [
  "https://stm.emdzej.pl",
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*",
];

export interface ListenAddress {
  host: string;
  port: number;
}

/** Parse `host:port`, `[v6]:port`, or a bare port (binds 127.0.0.1). */
export function parseListen(value: string): ListenAddress {
  let host: string;
  let portStr: string;
  const v6 = /^\[([^\]]+)\]:(\d+)$/.exec(value);
  if (v6) {
    host = v6[1]!;
    portStr = v6[2]!;
  } else if (/^\d+$/.test(value)) {
    host = "127.0.0.1";
    portStr = value;
  } else {
    const idx = value.lastIndexOf(":");
    if (idx <= 0 || value.indexOf(":") !== idx) {
      throw new Error(`Invalid --listen "${value}" (use host:port, or [addr]:port for IPv6)`);
    }
    host = value.slice(0, idx);
    portStr = value.slice(idx + 1);
  }
  const port = Number(portStr);
  if (!/^\d+$/.test(portStr) || port < 0 || port > 65535) {
    throw new Error(`Invalid port in --listen "${value}"`);
  }
  return { host, port };
}

export function isLoopback(host: string): boolean {
  return host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
}

/** Split a command line into argv, honouring single quotes, double quotes
 * and backslash escapes. No variable expansion or globbing — this is not a
 * shell, it just stops `--exec 'sh -c "echo a b"'` from being mangled. */
export function splitCommand(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inToken = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < command.length && /["\\$`]/.test(command[i + 1]!)) cur += command[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inToken = true;
    } else if (c === "\\" && i + 1 < command.length) {
      cur += command[++i];
      inToken = true;
    } else if (/\s/.test(c)) {
      if (inToken) out.push(cur);
      cur = "";
      inToken = false;
    } else {
      cur += c;
      inToken = true;
    }
  }
  if (quote) throw new Error("Unterminated quote in --exec command");
  if (inToken) out.push(cur);
  return out;
}

/** Match an Origin against exact origins, `*` (anything), or `scheme://host:*`
 * (any port). */
export function originAllowed(origin: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (p === "*" || p === origin) return true;
    if (p.endsWith(":*")) {
      const base = p.slice(0, -2);
      if (origin === base || (origin.startsWith(base + ":") && /^\d+$/.test(origin.slice(base.length + 1)))) {
        return true;
      }
    }
  }
  return false;
}

export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Constant-time string compare. Hashing first equalises lengths so
 * timingSafeEqual doesn't throw (and length isn't leaked). */
export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export interface AuthPolicy {
  /** undefined = auth disabled (`--no-auth`). */
  token?: string;
  allowedOrigins: readonly string[];
}

export type AuthResult =
  | { ok: true; via: "none" | "subprotocol" | "header" | "query" }
  | { ok: false; status: 401 | 403; reason: string };

export function authorize(
  req: { headers: Record<string, string | string[] | undefined>; url?: string },
  policy: AuthPolicy,
): AuthResult {
  const origin = first(req.headers.origin);
  if (origin !== undefined && !originAllowed(origin, policy.allowedOrigins)) {
    return { ok: false, status: 403, reason: `origin ${origin} not allowed` };
  }
  if (policy.token === undefined) return { ok: true, via: "none" };

  const protoHeader = first(req.headers["sec-websocket-protocol"]);
  if (protoHeader) {
    const offered = tokenFromSubprotocols(protoHeader.split(",").map((s) => s.trim()));
    if (offered !== undefined && tokensEqual(offered, policy.token)) {
      return { ok: true, via: "subprotocol" };
    }
  }

  const auth = first(req.headers.authorization);
  if (auth?.startsWith("Bearer ") && tokensEqual(auth.slice(7), policy.token)) {
    return { ok: true, via: "header" };
  }

  // Legacy (<= 0.2.x web client). Still accepted so a cached PWA keeps
  // working, but the server warns — query strings end up in logs.
  if (req.url) {
    const q = new URL(req.url, "http://localhost").searchParams.get("token");
    if (q !== null && tokensEqual(q, policy.token)) return { ok: true, via: "query" };
  }
  return { ok: false, status: 401, reason: "missing or invalid token" };
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Environment passed to `--exec` children under `--clean-env`: enough for a
 * usable shell, nothing that tends to hold credentials. */
export const CLEAN_ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ"];

export function buildChildEnv(source: NodeJS.ProcessEnv, clean: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  // node-pty crashes on env keys with `undefined` values — filter to strings.
  for (const [k, v] of Object.entries(source)) {
    if (typeof v !== "string") continue;
    if (clean && !CLEAN_ENV_KEYS.includes(k)) continue;
    out[k] = v;
  }
  out.TERM = "xterm-256color";
  return out;
}
