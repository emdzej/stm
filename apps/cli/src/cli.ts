// Shebang for the executable is added by the esbuild bundle banner, not here —
// keeping it out of the source so `tsx`-driven dev runs don't see a duplicate.
import { Command, InvalidArgumentError, Option } from "commander";
import { readFileSync } from "node:fs";
import { startTunnel } from "./server.js";
import {
  DEFAULT_ALLOWED_ORIGINS,
  generateToken,
  isLoopback,
  parseListen,
  type ListenAddress,
} from "./options.js";

const program = new Command();

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function parseBaud(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError("must be a positive integer");
  return n;
}

function parseListenOpt(value: string): ListenAddress {
  try {
    return parseListen(value);
  } catch (err) {
    throw new InvalidArgumentError((err as Error).message);
  }
}

program
  .name("stm-tunnel")
  .description("Bridge a serial port (or a PTY-hosted command) to a WebSocket so browsers without Web Serial can connect.")
  .option("-p, --port <path>", "Serial port path (e.g. /dev/ttyUSB0, COM3)")
  .option(
    "-e, --exec <command>",
    'Spawn a command in a PTY instead of opening a serial port (e.g. "bash -i"). Quotes are honoured. Always requires a token.',
  )
  .option("-b, --baud <rate>", "Default baud rate (client can override on OPEN; ignored with --exec)", parseBaud, 115200)
  .addOption(
    new Option("-l, --listen <host:port>", "Bind address; use [addr]:port for IPv6")
      .argParser(parseListenOpt)
      .default({ host: "127.0.0.1", port: 8787 }, "127.0.0.1:8787"),
  )
  .option("--token <token>", "Auth token clients must present. A random one is generated if omitted. Prefer STM_TUNNEL_TOKEN env var (argv is visible in `ps`).")
  .option("--no-auth", "Disable token auth. Only allowed on loopback binds in --port mode.")
  .option(
    "--allowed-origin <origin>",
    `Accepted browser Origin (repeatable; "scheme://host:*" matches any port, "*" matches any origin). Default: ${DEFAULT_ALLOWED_ORIGINS.join(", ")}`,
    collect,
  )
  .option("--clean-env", "With --exec, pass only a minimal environment (PATH, HOME, USER, SHELL, LANG, …) to the child", false)
  .option("--tls-cert <path>", "TLS certificate (PEM) for wss://")
  .option("--tls-key <path>", "TLS private key (PEM) for wss://")
  .option("-v, --verbose", "Verbose logging", false)
  .parse(process.argv);

const opts = program.opts<{
  port?: string;
  exec?: string;
  baud: number;
  listen: ListenAddress;
  token?: string;
  auth: boolean;
  allowedOrigin?: string[];
  cleanEnv: boolean;
  tlsCert?: string;
  tlsKey?: string;
  verbose: boolean;
}>();

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!opts.port && !opts.exec) fail("Specify --port <serial> or --exec <command>.");
if (opts.port && opts.exec) fail("--port and --exec are mutually exclusive.");

const { host, port: listenPort } = opts.listen;
const loopback = isLoopback(host);

let token = opts.token ?? process.env.STM_TUNNEL_TOKEN;
if (token !== undefined && token.length === 0) fail("--token must not be empty.");
if (!opts.auth) {
  if (token) fail("--no-auth and --token are mutually exclusive.");
  if (!loopback) fail("Refusing --no-auth on a non-loopback bind.");
  if (opts.exec) fail("Refusing --no-auth with --exec: that would expose a shell without authentication.");
}
let generated = false;
if (opts.auth && !token) {
  token = generateToken();
  generated = true;
}

if (Boolean(opts.tlsCert) !== Boolean(opts.tlsKey)) {
  fail("--tls-cert and --tls-key must be given together.");
}
const tls =
  opts.tlsCert && opts.tlsKey
    ? { cert: readFileSync(opts.tlsCert), key: readFileSync(opts.tlsKey) }
    : undefined;
if (!loopback && !tls) {
  console.warn("[tunnel] WARNING: non-loopback bind without TLS — the token and all traffic travel in cleartext.");
}

startTunnel({
  serialPath: opts.port,
  execCommand: opts.exec,
  defaultBaud: opts.baud,
  host,
  port: listenPort,
  auth: {
    token: opts.auth ? token : undefined,
    allowedOrigins: opts.allowedOrigin ?? DEFAULT_ALLOWED_ORIGINS,
  },
  tls,
  cleanEnv: opts.cleanEnv,
  verbose: opts.verbose,
})
  .then(() => {
    if (generated) {
      console.log(`[tunnel] token: ${token}`);
      console.log("[tunnel]   (generated for this run — paste it into the web app, or pass --token / STM_TUNNEL_TOKEN)");
    }
  })
  .catch((err) => {
    console.error("Tunnel failed to start:", err);
    process.exit(1);
  });
