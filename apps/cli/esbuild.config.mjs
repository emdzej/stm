import { build } from "esbuild";
import { rmSync, chmodSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

// Bundle: workspace dep (@emdzej/stm-tunnel-protocol) gets inlined so the
// published package doesn't carry a `workspace:*` dep. Real npm deps stay
// external — they're declared in package.json and installed normally.
// node-pty is optional and dynamically imported at runtime.
await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["commander", "serialport", "ws", "node-pty"],
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: true,
  logLevel: "info",
});

chmodSync("dist/cli.js", 0o755);
