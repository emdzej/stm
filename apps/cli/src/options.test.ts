import { describe, it, expect } from "vitest";
import { clientSubprotocols } from "@emdzej/stm-tunnel-protocol";
import {
  DEFAULT_ALLOWED_ORIGINS,
  authorize,
  buildChildEnv,
  isLoopback,
  originAllowed,
  parseListen,
  splitCommand,
  tokensEqual,
} from "./options.js";

describe("parseListen", () => {
  it("parses host:port, [v6]:port and bare port", () => {
    expect(parseListen("127.0.0.1:8787")).toEqual({ host: "127.0.0.1", port: 8787 });
    expect(parseListen("0.0.0.0:1")).toEqual({ host: "0.0.0.0", port: 1 });
    expect(parseListen("[::1]:8787")).toEqual({ host: "::1", port: 8787 });
    expect(parseListen("9000")).toEqual({ host: "127.0.0.1", port: 9000 });
  });
  it("rejects garbage", () => {
    for (const bad of ["::1:8787", "host:", ":80", "host:abc", "host:70000", "a:b:c"]) {
      expect(() => parseListen(bad), bad).toThrow();
    }
  });
});

describe("isLoopback", () => {
  it("recognises loopback forms", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("127.1.2.3")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("localhost")).toBe(true);
    expect(isLoopback("0.0.0.0")).toBe(false);
    expect(isLoopback("::")).toBe(false);
    expect(isLoopback("192.168.1.1")).toBe(false);
  });
});

describe("splitCommand", () => {
  it("splits on whitespace and honours quotes/escapes", () => {
    expect(splitCommand("bash -i")).toEqual(["bash", "-i"]);
    expect(splitCommand(`sh -c "echo a b"`)).toEqual(["sh", "-c", "echo a b"]);
    expect(splitCommand(`sh -c 'echo "x" $HOME'`)).toEqual(["sh", "-c", 'echo "x" $HOME']);
    expect(splitCommand(`a\\ b "" c`)).toEqual(["a b", "", "c"]);
    expect(splitCommand("  ")).toEqual([]);
  });
  it("rejects unterminated quotes", () => {
    expect(() => splitCommand(`sh -c "oops`)).toThrow(/quote/);
  });
});

describe("originAllowed", () => {
  it("matches exact, port-wildcard and star", () => {
    expect(originAllowed("https://stm.emdzej.pl", DEFAULT_ALLOWED_ORIGINS)).toBe(true);
    expect(originAllowed("http://localhost:5176", DEFAULT_ALLOWED_ORIGINS)).toBe(true);
    expect(originAllowed("http://127.0.0.1:4173", DEFAULT_ALLOWED_ORIGINS)).toBe(true);
    expect(originAllowed("http://localhost", DEFAULT_ALLOWED_ORIGINS)).toBe(true);
    expect(originAllowed("https://evil.example", DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(originAllowed("http://localhost.evil.example", DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(originAllowed("http://localhost:80.evil.example", DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(originAllowed("https://stm.emdzej.pl.evil.example", DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(originAllowed("null", DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(originAllowed("anything", ["*"])).toBe(true);
  });
});

describe("authorize", () => {
  const policy = { token: "s3cret", allowedOrigins: DEFAULT_ALLOWED_ORIGINS };
  const subproto = clientSubprotocols("s3cret").join(", ");

  it("rejects cross-site origins even with a valid token", () => {
    const r = authorize(
      { headers: { origin: "https://evil.example", "sec-websocket-protocol": subproto } },
      policy,
    );
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts the token via subprotocol, bearer header, or legacy query", () => {
    const origin = "https://stm.emdzej.pl";
    expect(authorize({ headers: { origin, "sec-websocket-protocol": subproto } }, policy)).toEqual({
      ok: true,
      via: "subprotocol",
    });
    expect(authorize({ headers: { authorization: "Bearer s3cret" } }, policy)).toEqual({ ok: true, via: "header" });
    expect(authorize({ headers: { origin }, url: "/?token=s3cret" }, policy)).toEqual({ ok: true, via: "query" });
  });

  it("rejects missing / wrong tokens", () => {
    expect(authorize({ headers: {} }, policy)).toMatchObject({ ok: false, status: 401 });
    expect(
      authorize({ headers: { "sec-websocket-protocol": clientSubprotocols("nope").join(",") } }, policy),
    ).toMatchObject({ ok: false, status: 401 });
    expect(authorize({ headers: { authorization: "Bearer s3cre" } }, policy)).toMatchObject({ ok: false });
  });

  it("with auth disabled still enforces the origin allowlist", () => {
    const open = { token: undefined, allowedOrigins: DEFAULT_ALLOWED_ORIGINS };
    expect(authorize({ headers: {} }, open)).toEqual({ ok: true, via: "none" });
    expect(authorize({ headers: { origin: "https://evil.example" } }, open)).toMatchObject({ ok: false });
  });
});

describe("tokensEqual", () => {
  it("compares regardless of length", () => {
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abcd")).toBe(false);
    expect(tokensEqual("", "x")).toBe(false);
  });
});

describe("buildChildEnv", () => {
  const src = { PATH: "/bin", HOME: "/h", AWS_SECRET_ACCESS_KEY: "x", UNDEF: undefined };
  it("drops undefined values and sets TERM", () => {
    expect(buildChildEnv(src, false)).toEqual({ PATH: "/bin", HOME: "/h", AWS_SECRET_ACCESS_KEY: "x", TERM: "xterm-256color" });
  });
  it("clean mode keeps only the allowlist", () => {
    expect(buildChildEnv(src, true)).toEqual({ PATH: "/bin", HOME: "/h", TERM: "xterm-256color" });
  });
});
