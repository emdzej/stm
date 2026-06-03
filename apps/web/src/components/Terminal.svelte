<script lang="ts">
  import { onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { WebglAddon } from "@xterm/addon-webgl";
  import "@xterm/xterm/css/xterm.css";
  import { bridge } from "../lib/serial-bridge.svelte";

  let container: HTMLDivElement;

  onMount(() => {
    const styles = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string): string =>
      styles.getPropertyValue(name).trim() || fallback;

    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: "block",
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

    fit.fit();
    term.focus();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // container temporarily zero-sized while hidden — ignore.
      }
    });
    ro.observe(container);

    const encoder = new TextEncoder();
    const off = bridge.onData((bytes) => term.write(bytes));
    const inputSub = term.onData((data) => {
      void bridge.write(encoder.encode(data)).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[STM] write failed:", err);
      });
    });

    return () => {
      ro.disconnect();
      off();
      inputSub.dispose();
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
