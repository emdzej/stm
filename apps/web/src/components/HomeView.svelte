<script lang="ts">
  import { app } from "../lib/state.svelte";
  import { isWebSerialAvailable } from "@emdzej/stm-serial-core";
</script>

<div class="mx-auto flex h-full max-w-2xl flex-col justify-center p-6 text-sm">
  <h1 class="mb-2 text-2xl font-semibold">
    <span class="text-accent">S</span>erial <span class="text-accent">T</span>erminal &amp;
    <span class="text-accent">M</span>onitor
  </h1>
  <p class="mb-6 text-muted">Bytes in. Bytes out. Dark mode.</p>

  <div class="mb-4 rounded border border-divider bg-surface p-4">
    <h2 class="mb-2 font-semibold">Get started</h2>
    <ol class="ml-4 list-decimal space-y-1 text-muted">
      <li>Hit <span class="text-foreground">Connect</span> in the top right.</li>
      <li>Pick a transport (Web Serial / tunnel) and your baud rate.</li>
      <li>Switch between Monitor and Terminal once connected.</li>
    </ol>
  </div>

  {#if !isWebSerialAvailable()}
    <div class="rounded border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
      <strong>Heads-up:</strong> Web Serial isn't available in this browser. Use Chrome,
      Edge, or another Chromium browser — or run the tunnel CLI on a machine with the
      device attached and connect via WebSocket.
    </div>
  {/if}

  <p class="mt-6 text-xs text-faint">
    Connection state: {app.connection.kind}
  </p>
</div>
