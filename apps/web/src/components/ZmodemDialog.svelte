<script lang="ts">
  import { Dialog, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { xfer, acceptOffer, skipOffer, dismissXfer } from "../lib/zmodem.svelte";

  // Dialog is open whenever there's a transfer in any state other than idle.
  const open = $derived(xfer.state.kind !== "idle");

  const title = $derived.by(() => {
    switch (xfer.state.kind) {
      case "offered":
        return "ZMODEM file offered";
      case "receiving":
        return "Receiving file";
      case "complete":
        return "Transfer complete";
      case "error":
        return "Transfer error";
      default:
        return "ZMODEM";
    }
  });

  function formatBytes(n: number): string {
    if (!n) return "0 B";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<Dialog {open} onClose={dismissXfer} label={title} width="w-[28rem]">
  <h2 class="mb-3 font-semibold">{title}</h2>

  {#if xfer.state.kind === "offered"}
    <p class="mb-3 text-xs text-muted">
      The remote device is offering a file:
    </p>
    <div class="mb-3 rounded border border-divider bg-base p-3 font-mono text-xs">
      <div class="font-semibold text-foreground">{xfer.state.filename}</div>
      <div class="text-faint">{formatBytes(xfer.state.size)}</div>
    </div>
    <div class="flex justify-end gap-2 text-xs">
      <button class={BUTTON_SECONDARY} onclick={skipOffer}>Skip</button>
      <button class={BUTTON_PRIMARY} onclick={acceptOffer}>Accept</button>
    </div>
  {:else if xfer.state.kind === "receiving"}
    <p class="mb-2 text-xs text-muted">
      Receiving <span class="font-mono">{xfer.state.filename}</span>…
    </p>
    {#if xfer.state.size > 0}
      {@const pct = Math.round((xfer.state.received / xfer.state.size) * 100)}
      <div class="mb-2 h-2 overflow-hidden rounded border border-divider bg-base">
        <div class="h-full bg-accent transition-all" style="width: {pct}%"></div>
      </div>
      <div class="text-xs font-mono text-faint">
        {formatBytes(xfer.state.received)} / {formatBytes(xfer.state.size)} ({pct}%)
      </div>
    {:else}
      <div class="text-xs font-mono text-faint">
        {formatBytes(xfer.state.received)} received (size unknown)
      </div>
    {/if}
  {:else if xfer.state.kind === "complete"}
    <p class="mb-3 text-xs text-muted">
      Received <span class="font-mono">{xfer.state.filename}</span>
      ({formatBytes(xfer.state.bytes)}). Saved to your browser's Downloads folder.
    </p>
    <div class="flex justify-end text-xs">
      <button class={BUTTON_SECONDARY} onclick={dismissXfer}>Close</button>
    </div>
  {:else if xfer.state.kind === "error"}
    <p class="mb-3 text-xs text-danger">{xfer.state.message}</p>
    <div class="flex justify-end text-xs">
      <button class={BUTTON_SECONDARY} onclick={dismissXfer}>Close</button>
    </div>
  {/if}
</Dialog>
