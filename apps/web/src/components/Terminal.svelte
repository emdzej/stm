<script lang="ts">
  import { onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { WebglAddon } from "@xterm/addon-webgl";
  import "@xterm/xterm/css/xterm.css";
  import { bridge } from "../lib/serial-bridge.svelte";
  import { settings } from "../lib/settings.svelte";
  import { createZmodemPipe } from "../lib/zmodem.svelte";

  let container: HTMLDivElement;

  onMount(() => {
    const styles = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string): string =>
      styles.getPropertyValue(name).trim() || fallback;

    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: settings.terminal.fontSize,
      cursorBlink: true,
      cursorStyle: settings.terminal.cursorStyle,
      convertEol: false,
      scrollback: 10000,
      theme: {
        background: v("--theme-bg-base", "#0b0b0e"),
        foreground: v("--theme-text-foreground", "#f4f4f5"),
        cursor: "#3b82f6",
        cursorAccent: v("--theme-bg-base", "#0b0b0e"),
        selectionBackground: "rgba(59, 130, 246, 0.35)",
        black: "#1c1c22",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#f4f4f5",
        brightBlack: "#71717a",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fcd34d",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#fafafa",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);

    // WebGL renderer is dramatically faster but requires hardware support.
    // It throws on context-loss / unsupported environments — fall back silently.
    try {
      const webgl = new WebglAddon();
      term.loadAddon(webgl);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[STM] WebGL renderer unavailable, using canvas fallback:", err);
    }

    // Initial geometry — applyGeometry isn't yet defined when we first hit
    // here, so do it inline; subsequent updates come from the $effect below.
    try {
      if (settings.terminal.geometry === "fixed") {
        term.resize(settings.terminal.cols, settings.terminal.rows);
      } else {
        fit.fit();
      }
    } catch {
      // ignore
    }
    term.focus();

    function applyGeometry(): void {
      try {
        if (settings.terminal.geometry === "fixed") {
          term.resize(settings.terminal.cols, settings.terminal.rows);
        } else {
          fit.fit();
        }
      } catch {
        // container hidden or zero-sized — ignore, retry on next tick.
      }
    }

    const ro = new ResizeObserver(() => {
      if (settings.terminal.geometry === "fit") applyGeometry();
    });
    ro.observe(container);

    // Live-apply font size, cursor style, and geometry changes from
    // Settings without remounting.
    $effect(() => {
      term.options.fontSize = settings.terminal.fontSize;
      applyGeometry();
    });
    $effect(() => {
      term.options.cursorStyle = settings.terminal.cursorStyle;
    });
    $effect(() => {
      // Touch cols/rows/geometry so this effect re-runs on any change.
      void settings.terminal.geometry;
      void settings.terminal.cols;
      void settings.terminal.rows;
      applyGeometry();
    });

    const encoder = new TextEncoder();
    // ZMODEM pipe sits between bridge and terminal: it intercepts ZMODEM
    // frames (auto-detects when the device runs `sz file`) and passes
    // everything else through to the terminal verbatim.
    const zpipe = createZmodemPipe({
      toTerminal: (bytes) => {
        if (!settings.terminal.eightBitClean) {
          const masked = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) masked[i] = bytes[i] & 0x7f;
          term.write(masked);
        } else {
          term.write(bytes);
        }
      },
      send: (bytes) => {
        void bridge.write(bytes).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[STM] zmodem send failed:", err);
        });
      },
    });
    const off = bridge.onData((bytes) => zpipe.consume(bytes));
    const inputSub = term.onData((data) => {
      // xterm.js sends 0x7F (DEL) for the Backspace key by default. Bootloaders
      // and some legacy systems expect 0x08 (^H) — remap when requested.
      let payload = data;
      if (settings.terminal.backspaceMode === "ctrl-h") {
        payload = payload.replace(/\x7f/g, "\x08");
      }
      // Local echo: also paint outgoing bytes to the terminal for devices
      // that don't echo. Done before write so it's visible immediately even
      // if the WS round-trip is slow.
      if (settings.terminal.localEcho) {
        term.write(payload);
      }
      void bridge.write(encoder.encode(payload)).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[STM] write failed:", err);
      });
    });

    return () => {
      ro.disconnect();
      off();
      inputSub.dispose();
      zpipe.destroy();
      term.dispose();
    };
  });
</script>

<div bind:this={container} class="h-full w-full"></div>

<style>
  /* xterm sets its own font/padding via inline styles. This keeps the
     wrapper background matching the terminal background so resize gutters
     don't flash a different colour. */
  div :global(.xterm) {
    padding: 4px;
    height: 100%;
  }
  div :global(.xterm-viewport) {
    background-color: transparent !important;
  }
</style>
