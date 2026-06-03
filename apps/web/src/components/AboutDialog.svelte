<script lang="ts">
  import { Dialog, BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { app } from "../lib/state.svelte";

  function close(): void {
    app.showAbout = false;
  }
</script>

<Dialog open={app.showAbout} onClose={close} label="About STM" width="w-[24rem]">
  <h2 class="mb-2 font-semibold">STM</h2>
  <p class="mb-3 text-xs text-muted">
    Web-based serial monitor and terminal. Native Web Serial or WebSocket tunnel.
  </p>
  <dl class="space-y-1 text-xs">
    <div class="flex justify-between">
      <dt class="text-faint">Version</dt>
      <dd class="font-mono">{__APP_VERSION__}</dd>
    </div>
  </dl>
  <div class="mt-4 flex justify-end">
    <button class={BUTTON_SECONDARY} onclick={close}>Close</button>
  </div>
</Dialog>
