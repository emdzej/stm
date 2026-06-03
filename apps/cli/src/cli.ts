// Shebang for the executable is added by the esbuild bundle banner, not here —
// keeping it out of the source so `tsx`-driven dev runs don't see a duplicate.
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { startTunnel } from "./server.js";

const program = new Command();

program
  .name("stm-tunnel")
  .description("Bridge a serial port (or a PTY-hosted command) to a WebSocket so browsers without Web Serial can connect.")
  .option("-p, --port <path>", "Serial port path (e.g. /dev/ttyUSB0, COM3)")
  .option(
    "-e, --exec <command>",
    'Spawn a command in a PTY instead of opening a serial port (e.g. "bash -i"). Useful for testing terminal mode without hardware.',
  )
  .option("-b, --baud <rate>", "Default baud rate (client can override on OPEN; ignored with --exec)", "115200")
  .option("-l, --listen <host:port>", "Bind address", "127.0.0.1:8787")
  .option("--token <token>", "Required Authorization token. Mandatory for non-loopback binds.")
  .option("--allowed-origin <origin>", "Restrict accepted WebSocket Origin header")
  .option("--tls-cert <path>", "TLS certificate (PEM) for wss://")
  .option("--tls-key <path>", "TLS private key (PEM) for wss://")
  .option("-v, --verbose", "Verbose logging", false)
  .parse(process.argv);

const opts = program.opts<{
  port?: string;
  exec?: string;
  baud: string;
  listen: string;
  token?: string;
  allowedOrigin?: string;
  tlsCert?: string;
  tlsKey?: string;
  verbose: boolean;
}>();

if (!opts.port && !opts.exec) {
  console.error("Specify --port <serial> or --exec <command>.");
  process.exit(1);
}
if (opts.port && opts.exec) {
  console.error("--port and --exec are mutually exclusive.");
  process.exit(1);
}

const [host, portStr] = opts.listen.split(":");
const listenPort = Number(portStr);
if (!host || !Number.isFinite(listenPort)) {
  console.error(`Invalid --listen: ${opts.listen}`);
  process.exit(1);
}

const isLoopback = host === "127.0.0.1" || host === "::1" || host === "localhost";
if (!isLoopback && !opts.token) {
  console.error("Refusing to bind a non-loopback address without --token.");
  process.exit(1);
}

const tls =
  opts.tlsCert && opts.tlsKey
    ? { cert: readFileSync(opts.tlsCert), key: readFileSync(opts.tlsKey) }
    : undefined;

startTunnel({
  serialPath: opts.port,
  execCommand: opts.exec,
  defaultBaud: Number(opts.baud),
  host,
  port: listenPort,
  token: opts.token,
  allowedOrigin: opts.allowedOrigin,
  tls,
  verbose: opts.verbose,
}).catch((err) => {
  console.error("Tunnel failed to start:", err);
  process.exit(1);
});
