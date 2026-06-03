<script lang="ts">
  import { Dialog, BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { app } from "../lib/state.svelte";

  function close(): void {
    app.showSettings = false;
  }
</script>

<Dialog open={app.showSettings} onClose={close} label="Settings" width="w-[32rem]">
  <h2 class="mb-3 font-semibold">Settings</h2>
  <p class="text-xs text-muted">
    Serial presets, tunnel profiles, monitor &amp; terminal preferences. Coming soon —
    JSON import/export to follow.
  </p>
  <div class="mt-4 flex justify-end">
    <button class={BUTTON_SECONDARY} onclick={close}>Close</button>
  </div>
</Dialog>
