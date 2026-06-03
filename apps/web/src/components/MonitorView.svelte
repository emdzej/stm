<script lang="ts">
  import { onMount } from "svelte";
  import {
    SegmentedControl,
    VirtualLineList,
    BUTTON_PRIMARY,
    BUTTON_SECONDARY,
  } from "@emdzej/stm-ui";
  import { bridge } from "../lib/serial-bridge.svelte";
  import { app } from "../lib/state.svelte";
  import { settings } from "../lib/settings.svelte";
  import MacroPicker from "./MacroPicker.svelte";
  import {
    decodeForAscii,
    encodeAscii,
    formatHexRow,
    lineEndingBytes,
    parseHex,
  } from "../lib/format";

  const MAX_ASCII_LINES = 8192;
  const MAX_HEX_ROWS = 65_536;
  const LINE_HEIGHT = 16; // matches font-size: 12px (text-xs) + line-height 16

  let composer = $state("");
  let paused = $state(false);

  /** ASCII output split on `\n`. The trailing line may be incomplete until a
   * `\n` arrives; we keep appending to the last entry. */
  let asciiLines = $state<string[]>([""]);
  let hexRows = $state<string[]>([]);
  /** Trailing partial row (< 16 bytes). Rendered as the last line so sub-16
   * data is visible immediately; promoted into hexRows on the next chunk. */
  let hexTail = $state("");
  let hexOffset = 0;
  let hexAccum = new Uint8Array(0);

  let composerInput: HTMLInputElement | null = null;

  // Combined list passed to the virtual hex view: committed rows plus the
  // optional in-progress tail.
  const hexLines = $derived(hexTail ? [...hexRows, hexTail] : hexRows);

  onMount(() => {
    const off = bridge.onData((bytes) => {
      if (paused) return;
      appendAscii(bytes);
      appendHex(bytes);
    });
    return off;
  });

  function appendAscii(bytes: Uint8Array): void {
    const decoded = decodeForAscii(bytes);
    if (!decoded) return;
    // \r at the end of a line is a non-issue for display in whitespace-pre
    // mode, but \r in the middle (e.g. progress bars) would overwrite — we
    // accept the simpler split-on-\n model here. Terminal mode is the right
    // tool when devices use \r tricks.
    const parts = decoded.split("\n");
    const lastIdx = asciiLines.length - 1;
    asciiLines[lastIdx] = asciiLines[lastIdx] + parts[0];
    for (let i = 1; i < parts.length; i++) asciiLines.push(parts[i]);
    if (asciiLines.length > MAX_ASCII_LINES) {
      asciiLines = asciiLines.slice(asciiLines.length - MAX_ASCII_LINES);
    }
  }

  function appendHex(bytes: Uint8Array): void {
    const combined = new Uint8Array(hexAccum.length + bytes.length);
    combined.set(hexAccum, 0);
    combined.set(bytes, hexAccum.length);
    let i = 0;
    const newRows: string[] = [];
    while (combined.length - i >= 16) {
      newRows.push(formatHexRow(hexOffset, combined.subarray(i, i + 16)));
      hexOffset += 16;
      i += 16;
    }
    hexAccum = combined.subarray(i);
    if (newRows.length > 0) {
      const updated = hexRows.concat(newRows);
      hexRows =
        updated.length > MAX_HEX_ROWS ? updated.slice(updated.length - MAX_HEX_ROWS) : updated;
    }
    hexTail = hexAccum.length > 0 ? formatHexRow(hexOffset, hexAccum) : "";
  }

  function clear(): void {
    asciiLines = [""];
    hexRows = [];
    hexTail = "";
    hexOffset = 0;
    hexAccum = new Uint8Array(0);
  }

  async function send(): Promise<void> {
    if (
      !composer &&
      settings.monitor.composerMode === "ascii" &&
      settings.monitor.lineEnding === "none"
    )
      return;
    try {
      let bytes: Uint8Array;
      if (settings.monitor.composerMode === "ascii") {
        const payload = encodeAscii(composer);
        const ending = lineEndingBytes(settings.monitor.lineEnding);
        if (ending.length === 0) {
          bytes = payload;
        } else {
          bytes = new Uint8Array(payload.length + ending.length);
          bytes.set(payload, 0);
          bytes.set(ending, payload.length);
        }
      } else {
        bytes = parseHex(composer);
      }
      await bridge.write(bytes);
      if (settings.monitor.echoLocal) {
        // Pipe the same bytes back through our append so the user sees what
        // they sent in the stream view. Identical formatting to incoming data.
        appendAscii(bytes);
        appendHex(bytes);
      }
      composer = "";
      composerInput?.focus();
    } catch (err) {
      app.bannerError = (err as Error).message;
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      void send();
    }
  }

  function downloadLog(): void {
    const blob = new Blob([asciiLines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stm-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const empty = $derived(
    settings.monitor.view === "ascii"
      ? asciiLines.length === 1 && asciiLines[0] === ""
      : hexLines.length === 0,
  );
</script>

<div class="flex h-full flex-col">
  <div class="flex h-9 items-center gap-2 border-b border-divider bg-surface px-3 text-xs">
    <SegmentedControl
      options={[
        { value: "ascii", label: "ASCII" },
        { value: "hex", label: "HEX" },
      ]}
      bind:value={settings.monitor.view}
    />
    <span class="text-faint">
      rx {bridge.metrics.rxBytes.toLocaleString()} B
      ({bridge.metrics.rxRate.toFixed(0)} B/s) · tx {bridge.metrics.txBytes.toLocaleString()} B
    </span>
    <span class="flex-1"></span>
    <MacroPicker />
    <button
      class={paused
        ? "rounded border border-warning bg-surface px-2 py-0.5 text-warning transition hover:bg-elevated"
        : BUTTON_SECONDARY}
      onclick={() => (paused = !paused)}
    >
      {paused ? "Resume" : "Pause"}
    </button>
    <button class={BUTTON_SECONDARY} onclick={clear}>Clear</button>
    <button class={BUTTON_SECONDARY} onclick={downloadLog}>Save</button>
  </div>

  {#if empty}
    <div class="flex flex-1 items-center justify-center bg-base p-3 font-mono text-xs italic text-faint">
      (waiting for data…)
    </div>
  {:else if settings.monitor.view === "ascii"}
    <VirtualLineList
      class="flex-1 bg-base px-3 py-2 font-mono text-xs text-foreground"
      lines={asciiLines}
      lineHeight={LINE_HEIGHT}
    />
  {:else}
    <VirtualLineList
      class="flex-1 bg-base px-3 py-2 font-mono text-xs text-foreground"
      lines={hexLines}
      lineHeight={LINE_HEIGHT}
    />
  {/if}

  <div class="border-t border-divider bg-surface p-2">
    <div class="flex items-center gap-2 text-xs">
      <SegmentedControl
        options={[
          { value: "ascii", label: "ASCII" },
          { value: "hex", label: "HEX" },
        ]}
        bind:value={settings.monitor.composerMode}
      />
      <input
        bind:this={composerInput}
        type="text"
        class="flex-1 rounded border border-divider bg-base px-2 py-1 font-mono"
        placeholder={settings.monitor.composerMode === "ascii"
          ? "Type and press Enter…"
          : "Hex bytes, e.g. DE AD BE EF"}
        bind:value={composer}
        onkeydown={onKey}
      />
      {#if settings.monitor.composerMode === "ascii"}
        <SegmentedControl
          options={[
            { value: "none", label: "none" },
            { value: "cr", label: "CR" },
            { value: "lf", label: "LF" },
            { value: "crlf", label: "CRLF" },
            { value: "nul", label: "NUL" },
          ]}
          bind:value={settings.monitor.lineEnding}
        />
      {/if}
      <button class={BUTTON_PRIMARY} onclick={send}>Send</button>
    </div>
  </div>
</div>
