<script lang="ts">
  import { onMount } from "svelte";
  import { SegmentedControl, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@emdzej/stm-ui";
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

  const MAX_ASCII_CHARS = 256 * 1024;
  const MAX_HEX_ROWS = 4096;

  let composer = $state("");
  let paused = $state(false);

  let asciiText = $state("");
  let hexRows = $state<string[]>([]);
  let hexTail = $state("");
  let hexOffset = 0;
  let hexAccum = new Uint8Array(0);

  let viewport: HTMLDivElement | null = null;
  let composerInput: HTMLInputElement | null = null;

  onMount(() => {
    const off = bridge.onData((bytes) => {
      if (paused) return;
      appendAscii(bytes);
      appendHex(bytes);
      queueMicrotask(() => {
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      });
    });
    return off;
  });

  function appendAscii(bytes: Uint8Array): void {
    const next = asciiText + decodeForAscii(bytes);
    asciiText =
      next.length > MAX_ASCII_CHARS ? next.slice(next.length - MAX_ASCII_CHARS) : next;
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
    asciiText = "";
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
    const blob = new Blob([asciiText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stm-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }
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

  <div
    bind:this={viewport}
    class="flex-1 overflow-auto whitespace-pre bg-base p-3 font-mono text-xs text-foreground"
  >
    {#if settings.monitor.view === "ascii"}
      {#if asciiText.length === 0}
        <span class="italic text-faint">(waiting for data…)</span>
      {:else}
        {asciiText}
      {/if}
    {:else if hexRows.length === 0 && hexTail === ""}
      <span class="italic text-faint">(waiting for data…)</span>
    {:else}
      {#each hexRows as row, i (i)}
        <div>{row}</div>
      {/each}
      {#if hexTail}
        <div>{hexTail}</div>
      {/if}
    {/if}
  </div>

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
