# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-03

Initial release.

### Web app

#### Monitor mode
- ASCII view (non-printable bytes rendered as `·`, control whitespace preserved).
- Classic `xxd`-style HEX view with offset / hex / ASCII gutter columns. Partial trailing rows render immediately so sub-16-byte data is never invisible.
- Rolling buffers — 256 KiB of ASCII text, 4096 rows of hex — automatically trimmed.
- Composer with ASCII / HEX input modes; configurable line endings appended on Enter: none, CR, LF, CRLF, NUL.
- Pause, Clear, and Save-to-file controls.

#### Terminal mode
- xterm.js with full ANSI / xterm / VT220 support; WebGL renderer with canvas fallback; WebLinks addon for clickable URLs.
- FitAddon driven by a ResizeObserver so the terminal always matches its container.
- Theme colours pulled from app CSS variables — follows the active light / dark theme.
- Bottom toolbar of special keys browsers tend to intercept: Break (serial BRK signal), ^C / ^D / ^Z / ^\ / ^], Esc, Tab, and F1–F12.
- F-key chips honour Shift / Alt / Ctrl held during the click, emitting the xterm parametric modifier sequences (`ESC [ n ; mod ~`).

#### Transports
- **Web Serial** — direct USB/serial via the native API in Chromium-based browsers.
- **WebSocket tunnel** — connect to a remote `stm-tunnel` instance over `ws://` or `wss://`. Token auth, origin lockdown, TLS.
- Live port reconfigure — change baud / data bits / stop bits / parity / flow control without re-prompting for the device.
- WebSocket reconfigure stays on the same socket: sends `CLOSE` + `OPEN` over the existing connection instead of tearing the WS down.

#### Connect / Reconfigure dialogs
- Segmented controls for transport, baud (chips + custom numeric input), data bits, stop bits, parity, flow control.
- Persisted Connect state — transport, tunnel URL, token, full serial config — survives reload via localStorage.
- Reconfigure dialog mirrors the Connect form; reachable from the `115200 8N1` chip in the header when connected.

#### UI & settings
- Three-icon theme switch (system / light / dark) in the header; “system” mode tracks OS preference via `matchMedia` and updates live.
- Settings persist in `localStorage` under a versioned schema with nested merge — additive schema changes don’t wipe user values.
- Reusable UI primitives in `packages/ui`: `Dialog` (viewport-aware with margin + overflow scroll), `SegmentedControl` (generic over value type), button class constants.
- Dark / light tokens defined as CSS variables, consumed via a Tailwind preset.
- PWA-installable via `vite-plugin-pwa`; offline-ready service worker; custom domain (`stm.emdzej.pl`) via `CNAME`.
- Custom welcome heading: **S**erial **T**erminal & **M**onitor with the accent letters highlighted.

### `stm-tunnel` CLI
- Bridges a local serial port (or a PTY-hosted subprocess) to a WebSocket the web app can reach.
- Flags: `--port` (serial path), `--exec` (PTY subprocess, mutually exclusive with `--port`), `--baud`, `--listen`, `--token`, `--allowed-origin`, `--tls-cert`, `--tls-key`, `--verbose`.
- Refuses to bind a non-loopback address without `--token`.
- One device per process; sufficient and simple.
- Single-file bundled distribution (esbuild); workspace deps inlined, runtime deps stay external.
- `node-pty` listed as an **optional** dependency so installing the published package never fails on systems where the native build is blocked or unsupported.

### Architecture
- pnpm workspaces + Turborepo monorepo.
- `apps/web` (Svelte 5 runes, Tailwind 3, Vite) and `apps/cli` (Node 20+ CLI).
- `packages/serial-core` — `SerialTransport` interface with `WebSerialTransport` and `WebSocketTransport` implementations.
- `packages/serial-worker` — Web Worker that consumes a transferred `ReadableStream`, batches incoming bytes into ~16ms windows or 64 KiB high-water flushes, and reports rx metrics at 1 Hz.
- `packages/tunnel-protocol` — wire codec for the WebSocket frames (`DATA` / `OPEN` / `CLOSE` / `SIGNALS` / `STATE` / `ERROR` / `PING`).
- `packages/settings` — versioned settings schema, localStorage I/O, nested-merge `load()`.
- `packages/ui`, `packages/theme` — shared Svelte components and theme tokens.
- Stubs for `packages/protocols-xfer` (X/Y/ZMODEM) and `packages/logging` (OPFS sessions) — implementation in a future release.

### Infrastructure
- **CI** workflow (`.github/workflows/ci.yml`) — install (frozen lockfile), lint, typecheck, test, build on push / PR / manual trigger.
- **Pages deploy** workflow (`.github/workflows/deploy-pages.yml`) — manual or on `release: published`; builds the web app and deploys via `actions/deploy-pages@v4`.
- **npm publish** workflow (`.github/workflows/publish.yml`) — on `release: published`; uses OIDC trusted publishing with `--provenance` (no `NPM_TOKEN` secret needed once the trusted publisher is configured on npmjs.com).

### Known issues
- node-pty's shipped prebuild may fail with `posix_spawnp failed` on macOS Tahoe (Darwin 25+) — the prebuild was compiled against an older SDK. Workaround: drop the prebuilds and rebuild from source.
  ```
  cd node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
  npx node-gyp rebuild
  ```
  Requires Xcode Command Line Tools. The README's `--exec` section documents the same fix and points to socat as a reliable alternative.
- Settings dialog content is currently a placeholder — JSON import/export and a preset library land in a follow-up release.
- X / Y / ZMODEM file transfer and OPFS session logging are scaffolded but not yet implemented.

[0.1.0]: https://github.com/emdzej/stm/releases/tag/v0.1.0
