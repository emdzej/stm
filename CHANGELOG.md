# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-09-26

Security and maintenance release. It follows a repository audit. **Upgrade
the tunnel and the web app together** (see *Breaking* below).

### Security
- **Cross-site WebSocket hijacking in `stm-tunnel` (critical).** Browsers
  don't apply CORS to WebSockets, so in the default tokenless loopback setup,
  any page open in the user's browser could connect to
  `ws://127.0.0.1:8787`. With `--exec` that meant a shell; with `--port`,
  full access to the serial device. Fixed on two fronts:
  - **Origin allowlist on by default**: `https://stm.emdzej.pl` plus
    `http://localhost:*`, `http://127.0.0.1:*` and `http://[::1]:*`.
    `--allowed-origin` is now repeatable and accepts `scheme://host:*` and
    `*`. Clients that send no `Origin` header (non-browser tools) are still
    accepted.
  - **Token always required.** A random one is generated and printed if none
    is given. New `STM_TUNNEL_TOKEN` env var, so the token doesn't have to
    appear in `ps`. `--no-auth` is only accepted for loopback binds in
    `--port` mode, never with `--exec`.
- **The token no longer travels in the URL.** The web client now sends it in
  `Sec-WebSocket-Protocol` (`stm.v1` plus a base64url token entry) instead of
  `?token=`, which leaked into logs and history. The server compares tokens
  in constant time. The legacy `?token=` form is still accepted, with a
  warning, so a cached 0.2.x PWA keeps working.
- **Runtime validation of wire frames.** OPEN configs (baud rate, data bits,
  stop bits, parity, flow control), SIGNALS, STATE and ERROR are checked
  instead of cast. Unknown keys are dropped.
- **Resource limits.** Inbound frames are capped at 1 MiB (the `ws` default
  was 100 MiB). Backpressure pauses the serial port or PTY while the client
  falls behind, instead of buffering without limit. A 30 s heartbeat drops
  half-open clients that would otherwise hold the single client slot.
- **`--clean-env`** gives an `--exec` child a minimal environment (`PATH`,
  `HOME`, `USER`, `SHELL`, locale, `TERM`) instead of everything, cloud
  credentials included.
- A non-loopback bind without TLS now prints a cleartext warning.
- **Settings import is validated.** Wrong-typed values and malformed
  presets, profiles or macros are dropped instead of loaded. **Exports
  redact tunnel tokens** unless "Include tokens" is ticked.
- Dependency audit: 36 advisories (1 critical, 24 high) down to 0. All of
  them were in dev or build tooling; the shipped runtime deps had none.

### Fixed
- A second OPEN without CLOSE leaked the first device (an extra PTY process,
  or a port left locked). Frames are now handled strictly in order, so
  reconfigure's CLOSE+OPEN can't interleave, and callbacks from a device
  that has already been closed can't clobber the new one.
- `--tls-cert` without `--tls-key` (or the reverse) silently fell back to
  plain `ws://`. It is now an error.
- `--listen` couldn't parse IPv6. `[::1]:8787` and a bare port now work, and
  `--baud` is validated.
- `--exec` split on whitespace, which mangled quoted arguments. Single
  quotes, double quotes and backslash escapes are now handled.
- Hardware flow control (`flowControl: "hardware"`) was ignored by the
  tunnel. It now maps to `rtscts`.
- An unplugged serial device is reported to the client instead of going
  quiet. A PTY that exits resets state so the client can reopen.
- Plain HTTP requests to the tunnel hung. They now get `426 Upgrade
  Required`.
- The web client crashed on a malformed tunnel frame. It now reports an
  error instead.
- Settings import didn't apply macros or the logging preference.
- Opacity-modified theme colours (`bg-danger/10`, `bg-warning/10`,
  `border-warning/40`) were silently dropped by Tailwind 3 for `var()`
  colours. They now render, so the warning box and the "Remove" hover
  states get their intended tint.
- The xterm WebGL renderer is disposed on GPU context loss, so the terminal
  falls back to the DOM renderer instead of going blank.

### Changed
- **Breaking:** the tunnel requires a token by default. The Connect dialog's
  token field is no longer "optional". Paste the token the tunnel prints, or
  pin one with `STM_TUNNEL_TOKEN`.
- **Breaking:** a self-hosted web app on an origin other than the defaults
  must be allowed with `--allowed-origin`.
- **Breaking:** Node.js **22.12+** is now required (Node 20 reached end of
  life in April 2026; vitest 5 and commander 15 need 22.12).
- `@emdzej/stm-theme` now ships a Tailwind v4 CSS theme (`theme.css`) in
  place of the v3 JS preset.
- The CLI is now linted, has its own test suite, and supports `--version`.

### Dependencies
- Runtime: commander 15, serialport 13, ws 8.22, node-pty 1.1, xterm 6
  (addon-fit 0.11, addon-web-links 0.12, addon-webgl 0.19).
- Tooling: Vite 8 (Rolldown), @sveltejs/vite-plugin-svelte 7, Tailwind CSS
  4 (`@tailwindcss/vite`; PostCSS and autoprefixer removed), Vitest 5,
  TypeScript 6.0, ESLint 10, typescript-eslint 8.70, esbuild 0.28, Svelte
  5.57, svelte-check 4.7, turbo 2.11, prettier 3.9.
- Scoped pnpm overrides for transitive `brace-expansion` and `fast-uri`.
- **Held back:** TypeScript 7. `typescript-eslint` (`<6.1`) and
  `svelte-check` (`^5 || ^6`) don't support it yet.

### CI
- All actions pinned to commit SHAs (latest majors), with
  `persist-credentials: false`.
- CI: explicit `contents: read`, Node 22 + 24 matrix, `pnpm audit` gate.
- Publish: npm pinned (was `@latest`), manual runs only from `main`, the
  release tag must match the package version, and tests run before publish.
- `@emdzej/stm-tunnel` declares `repository`. npm rejected every CI publish
  with provenance without it (E422), so 0.2.0 never reached npm.
- Dependabot for npm and GitHub Actions.

## [0.2.0] - 2026-06-04

### Added

#### Monitor mode
- **Virtualised** ASCII and HEX views via a new `VirtualLineList` primitive
  (in `packages/ui`). The ASCII view is now `lines[]` (split on `\n`)
  instead of a single rolling string; row caps raised to 8 k (ASCII) and
  65 k (HEX, ~1 MB of captured bytes). Stick-to-bottom only re-pins when
  the user is already there, so scrolling back stays sticky.
- **Local echo** (`settings.monitor.echoLocal`) — outgoing bytes are now
  piped back through the stream view when the toggle is on.

#### Terminal mode
- **Behaviour toggles** in Settings: Backspace key emits DEL (0x7F) or
  ^H (0x08), local echo, 8-bit clean, cursor style, font size — all
  live-applied to the running xterm via `$effect`.
- **Fixed geometry** (`settings.terminal.geometry: "fit" | "fixed"`). Fit
  is the default (matches prior behaviour); Fixed forces `term.resize(cols,
  rows)` and the wrapper switches to `overflow-auto` so larger grids
  scroll. Defaults match the original spec (80 × 25).
- **ZMODEM receive auto-detect** — the terminal byte stream is filtered
  through a ZMODEM Sentry (`zmodem.js`). When the device runs `sz <file>`,
  a transfer dialog pops with the offer, progress bar, and a download on
  completion.
- **ZMODEM send** — file picker → `rz\r` handshake → `Zmodem.Browser.send_files()`
  with live byte progress in the existing dialog. 10 s timeout if the
  remote shell has no `rz`.

#### Settings dialog
- Real content (was a placeholder): sections for Monitor, Terminal,
  Session logs, Tunnel profiles, Serial presets, and Macros.
- **JSON export** (download) / **JSON import** (file picker) / **Reset to
  defaults**.

#### Tunnel profiles
- Named `{ name, url, token }` profiles, persisted in
  `settings.tunnelProfiles`. ConnectDialog exposes a profile picker plus
  inline "Save as new" when the WebSocket tunnel transport is selected.
- Settings dialog manages the list with rename / remove.

#### Serial presets
- Saved port configs (`{ name, baud, dataBits, stopBits, parity, flowControl }`),
  persisted in `settings.serialPresets`.
- `SerialPresetPicker` dropdown above the `SerialConfigForm` in both
  Connect and Reconfigure dialogs with inline "Save as preset…".
- Settings dialog manages the list with rename / remove.

#### Macros
- Named byte sequences with `\r` `\n` `\t` `\0` `\\` `\xNN` escapes,
  persisted in `settings.macros`.
- `MacroPicker` shows as a dropdown in Monitor and Terminal toolbars when
  any are defined; falls back to a "Macros…" button (opens Settings) when
  empty.

#### Session logging
- Opt-in capture of every connected session's incoming bytes into an OPFS
  file per session, with metadata (timestamps, byte count, transport,
  config, label) in IndexedDB.
- `LogsDialog` lists sessions with editable labels, export-as-file, and
  delete. Refuses to delete the in-progress session.
- **Live byteCount ticks** during recording — the Settings indicator and
  the LogsDialog row both update without waiting for stop.

#### Header
- Version label links to the matching GitHub release tag.
- GitHub icon links to the project repo.
- Three-icon theme switch (system / light / dark) tracks the OS preference
  live in system mode.
- Cog icon replaces the Settings text button at the right edge.

#### Tests
- vitest suites land for `packages/tunnel-protocol` (11 tests — frame codec
  round-trips and negatives), `packages/settings` (7 tests — load / save /
  merge / import paths, including additive-schema merge), `apps/web/src/lib/format`
  (18 tests — `decodeForAscii`, `parseHex`, `lineEndingBytes`, `formatHexRow`),
  and `apps/web/src/lib/macros` (8 tests — escape interpretation). CI's
  `pnpm test` now exercises 44 specs.

### Removed
- `AboutDialog` — its only content was the version, which now links
  directly to the release tag.

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

[Unreleased]: https://github.com/emdzej/stm/compare/0.3.0...HEAD
[0.3.0]: https://github.com/emdzej/stm/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/emdzej/stm/releases/tag/0.2.0
[0.1.0]: https://github.com/emdzej/stm/releases/tag/0.1.0
