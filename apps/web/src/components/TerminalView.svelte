<script lang="ts">
  import { BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { app } from "../lib/state.svelte";
  import { bridge } from "../lib/serial-bridge.svelte";
  import Terminal from "./Terminal.svelte";

  /** Control characters and xterm function-key escape sequences. */
  const CTRL = {
    C: "\x03",
    D: "\x04",
    Z: "\x1a",
    BS: "\x1c", // ^\
    RB: "\x1d", // ^]
    ESC: "\x1b",
    TAB: "\x09",
  } as const;

  /** xterm function-key encoding.
   *
   * Plain form: F1–F4 use SS3 (`ESC O <letter>`), F5–F12 use CSI (`ESC [ n ~`).
   * With modifiers held (Shift/Alt/Ctrl on click), both families switch to the
   * parametric CSI form with a modifier digit:
   *   mod = 1 + (Shift?1:0) + (Alt?2:0) + (Ctrl?4:0)
   *   F1–F4 → `ESC [ 1 ; <mod> <letter>`
   *   F5–F12 → `ESC [ <n> ; <mod> ~`
   */
  const FN_KEYS: { label: string; n?: number; letter?: string }[] = [
    { label: "F1", letter: "P" },
    { label: "F2", letter: "Q" },
    { label: "F3", letter: "R" },
    { label: "F4", letter: "S" },
    { label: "F5", n: 15 },
    { label: "F6", n: 17 },
    { label: "F7", n: 18 },
    { label: "F8", n: 19 },
    { label: "F9", n: 20 },
    { label: "F10", n: 21 },
    { label: "F11", n: 23 },
    { label: "F12", n: 24 },
  ];

  function modFromEvent(e: MouseEvent): number {
    const shift = e.shiftKey ? 1 : 0;
    const alt = e.altKey ? 2 : 0;
    const ctrl = e.ctrlKey || e.metaKey ? 4 : 0;
    return shift + alt + ctrl;
  }

  function fnKeySeq(key: (typeof FN_KEYS)[number], mod: number): string {
    if (key.letter !== undefined) {
      return mod === 0 ? `\x1bO${key.letter}` : `\x1b[1;${1 + mod}${key.letter}`;
    }
    return mod === 0 ? `\x1b[${key.n}~` : `\x1b[${key.n};${1 + mod}~`;
  }

  const enc = new TextEncoder();

  async function send(str: string): Promise<void> {
    try {
      await bridge.write(enc.encode(str));
    } catch (err) {
      app.bannerError = (err as Error).message;
    }
  }

  async function sendBreak(): Promise<void> {
    try {
      await bridge.sendBreak();
    } catch (err) {
      app.bannerError = (err as Error).message;
    }
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex h-9 items-center gap-2 border-b border-divider bg-surface px-3 text-xs">
    <span class="text-faint">
      rx {bridge.metrics.rxBytes.toLocaleString()} B
      ({bridge.metrics.rxRate.toFixed(0)} B/s) · tx {bridge.metrics.txBytes.toLocaleString()} B
    </span>
    <span class="flex-1"></span>
    <button class={BUTTON_SECONDARY} title="X/Y/ZMODEM — coming soon" disabled>
      Send file…
    </button>
    <button class={BUTTON_SECONDARY} title="Macros — coming soon" disabled>
      Macros
    </button>
  </div>

  <div class="flex-1 overflow-hidden bg-base">
    <Terminal />
  </div>

  <div class="flex flex-wrap items-center gap-2 border-t border-divider bg-surface px-3 py-2 text-xs">
    <!-- Serial line break: not a character, asserts BRK signal -->
    <div class="flex gap-1 rounded border border-divider bg-elevated p-0.5">
      <button
        class="rounded px-2 py-0.5 text-muted hover:bg-base hover:text-foreground"
        title="Assert serial line BRK signal (~250ms)"
        onclick={sendBreak}
      >
        Break
      </button>
    </div>

    <!-- POSIX signals & telnet/screen escapes -->
    <div class="flex gap-1 rounded border border-divider bg-elevated p-0.5">
      <button
        class="rounded px-2 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
        title="SIGINT (0x03)"
        onclick={() => send(CTRL.C)}
      >
        ^C
      </button>
      <button
        class="rounded px-2 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
        title="EOF (0x04)"
        onclick={() => send(CTRL.D)}
      >
        ^D
      </button>
      <button
        class="rounded px-2 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
        title="SIGTSTP / suspend (0x1A)"
        onclick={() => send(CTRL.Z)}
      >
        ^Z
      </button>
      <button
        class="rounded px-2 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
        title="SIGQUIT (0x1C)"
        onclick={() => send(CTRL.BS)}
      >
        ^\
      </button>
      <button
        class="rounded px-2 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
        title="Telnet escape / screen prefix (0x1D)"
        onclick={() => send(CTRL.RB)}
      >
        ^]
      </button>
    </div>

    <!-- Editing keys browsers often eat -->
    <div class="flex gap-1 rounded border border-divider bg-elevated p-0.5">
      <button
        class="rounded px-2 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
        title="Escape (0x1B)"
        onclick={() => send(CTRL.ESC)}
      >
        Esc
      </button>
      <button
        class="rounded px-2 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
        title="Tab (0x09)"
        onclick={() => send(CTRL.TAB)}
      >
        Tab
      </button>
    </div>

    <!-- Function keys -->
    <div class="flex gap-1 rounded border border-divider bg-elevated p-0.5">
      {#each FN_KEYS as fk (fk.label)}
        <button
          class="rounded px-1.5 py-0.5 font-mono text-muted hover:bg-base hover:text-foreground"
          title="{fk.label} — hold Shift / Alt / Ctrl while clicking for modified xterm sequence"
          onclick={(e) => send(fnKeySeq(fk, modFromEvent(e)))}
        >
          {fk.label}
        </button>
      {/each}
    </div>
  </div>
</div>
