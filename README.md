# STM

Web-based serial monitor and terminal. Runs entirely in the browser — uses the native Web Serial API where available, or a small Node CLI tunnel for browsers that don't support it (Firefox, Safari, iOS). PWA-installable. Settings persist in localStorage.

## What's in it

**Monitor mode** — incoming stream rendered as ASCII (non-printables shown as `·`) or classic `xxd`-style hex. Composer with ASCII/HEX modes, configurable line endings (none / CR / LF / CRLF / NUL), pause, clear, save to file.

**Terminal mode** — xterm.js with full ANSI / xterm / VT220 support, WebGL renderer with canvas fallback, theme tracks app dark/light mode. Bottom toolbar for keys browsers tend to eat: Break (serial BRK signal), ^C ^D ^Z ^\ ^], Esc, Tab, and F1–F12 with Shift / Alt / Ctrl modifier support (hold a modifier while clicking the function-key chip to emit the modified xterm sequence).

**Transports** — two ways for the browser to reach the device:
- **Web Serial** (Chromium-based browsers): direct USB / serial via the native API.
- **WebSocket tunnel**: the `stm-tunnel` Node CLI runs on the host with the device attached and bridges its serial port to a WebSocket. Token auth, TLS, origin lock-down.

## Browser support

| Browser                       | Web Serial | Tunnel |
| ----------------------------- | :--------: | :----: |
| Chrome / Edge / Opera / Brave |    yes     |  yes   |
| Firefox / Safari / iOS Safari |     —      |  yes   |
| Android Chrome                |    yes     |  yes   |

Web Serial requires HTTPS or `localhost`. The tunnel works everywhere a WebSocket does.

## Repo layout

```
apps/
  web/                Svelte 5 SPA, PWA-installable
  cli/                Node CLI — stm-tunnel: bridges serial / PTY to WebSocket
packages/
  serial-core/        SerialTransport interface + Web Serial / WebSocket impls
  serial-worker/      Web Worker that batches incoming bytes to the UI
  tunnel-protocol/    Wire codec for the tunnel WebSocket frames
  settings/           Versioned settings schema, localStorage I/O
  ui/                 Shared Svelte primitives (Dialog, SegmentedControl, styles)
  theme/              Tailwind preset + CSS tokens
  protocols-xfer/     X/Y/ZMODEM (stub, TODO)
  logging/            OPFS session log (stub, TODO)
```

pnpm workspaces + Turborepo. Svelte 5 runes, Tailwind 3, Vite, vite-plugin-pwa.

## Install

Requires Node 20+ and pnpm 10+.

```
pnpm install
```

The tunnel CLI depends on `@serialport/bindings-cpp`, a native binding. If pnpm reports its postinstall is blocked, run `pnpm approve-builds @serialport/bindings-cpp` then `pnpm install` again. The web app doesn't need it.

## Run the web app

```
pnpm web              # dev server on http://localhost:5176
pnpm web:build        # production build into apps/web/dist
```

`apps/web/dist` is a single static bundle. Deploy it anywhere.

## Run the tunnel

Loopback only, default:

```
pnpm tunnel -- --port /dev/ttyUSB0 --baud 115200
```

Remote access — pick a non-loopback bind and require a token:

```
pnpm tunnel -- \
  --port /dev/ttyUSB0 \
  --listen 0.0.0.0:8787 \
  --token <secret> \
  --allowed-origin https://stm.example.com
```

`wss://` (required when the web app is served over HTTPS — mixed-content blocks plain `ws://`):

```
pnpm tunnel -- \
  --port /dev/ttyUSB0 \
  --listen 0.0.0.0:8787 \
  --token <secret> \
  --tls-cert cert.pem \
  --tls-key key.pem
```

One serial port per tunnel process. Run multiple instances on different listen ports for multiple devices.

In the web app: **Connect** → **WebSocket tunnel** → `ws://host:port`, paste the token, hit Connect.

## Testing terminal mode without hardware

The tunnel has a built-in `--exec` mode that spawns a PTY-backed subprocess in place of a serial port. The browser sees an interactive bash (or anything else) over the WebSocket as if it were a UART. No socat, no hardware.

```
pnpm tunnel -- --exec "bash -i"
```

In the web app: **Connect** → **WebSocket tunnel** → `ws://127.0.0.1:8787` → switch to **Terminal**. Good things to try: `vim`, `htop`, `less`, `mc`, `tput colors`, `clear && ls --color=always`.

`--exec` accepts any command string:
- `--exec "vim /etc/hosts"` — straight into vim
- `--exec "top -d 1"` — animated screen updates
- `--exec "ls --color=always -la /usr; bash -i"` — coloured `ls` then a shell

`--exec` uses `node-pty`, listed as an **optional** dependency. If its native build was skipped during install, allow it and reinstall:

```
pnpm approve-builds node-pty
pnpm install
```

> **Known issue on bleeding-edge macOS:** node-pty's shipped prebuilds may fail with `posix_spawnp failed` on macOS Tahoe (Darwin 25+) because the prebuild was compiled against an older SDK. Workaround — drop the prebuilds and compile from source against your local Node:
>
> ```
> find node_modules -type d -name prebuilds -path '*node-pty*' -prune -exec rm -rf {} +
> pnpm rebuild node-pty
> ```
>
> Requires Xcode Command Line Tools (`xcode-select --install`). If that still doesn't work, use the [socat fallback](#alternative-socat).

### Alternative: socat

If you'd rather not build node-pty, `socat` can do the same thing externally:

```bash
# Terminal A: virtual PTY linked to an interactive bash
socat -d -d \
  PTY,link=/tmp/stm-tty,raw,echo=0 \
  EXEC:'bash -i',pty,setsid,stderr,sigint,sane

# Terminal B: bridge that PTY to a WebSocket
pnpm tunnel -- --port /tmp/stm-tty --baud 115200
```

Platform notes:
- macOS: `brew install socat`
- Linux: usually preinstalled, otherwise `apt install socat`
- Windows: no native socat — use WSL2, or pair `com0com` with a serial server

## Settings

Settings live in `localStorage` under `stm.settings.v1`. The schema is versioned; additive changes are merged in non-destructively, so new fields default sensibly without wiping user values. Incompatible bumps reset to defaults.

Currently persisted: theme choice (system/light/dark), Connect dialog state (transport, tunnel URL & token, full serial config), Monitor preferences (display mode, composer mode, line ending). JSON import/export lands in the Settings dialog (TODO).

## Status

Working:
- Monitor mode (ASCII + HEX views, composer, configurable line endings)
- Terminal mode (xterm.js + special-key toolbar with modifier support)
- Web Serial + WebSocket tunnel transports
- Live port reconfigure (change baud, parity, etc. without re-prompting)
- Theme switch (system / light / dark) with live OS-preference tracking
- Persisted Connect + Monitor settings
- PWA-installable

Roadmap:
- X / Y / ZMODEM file transfer in terminal mode
- OPFS session logging with browse + export
- Settings dialog (preset library, JSON import/export)
- Named tunnel profiles
- Custom macros / AT command snippets
- Backspace mode toggle (^H vs DEL), local echo, 8-bit-clean

## License

See [LICENSE](LICENSE).
