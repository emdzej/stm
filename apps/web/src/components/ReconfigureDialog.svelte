<script lang="ts">
  import { Dialog, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { app } from "../lib/state.svelte";
  import { bridge } from "../lib/serial-bridge.svelte";
  import type { SerialConfig } from "@emdzej/stm-serial-core";
  import SerialConfigForm from "./SerialConfigForm.svelte";
  import SerialPresetPicker from "./SerialPresetPicker.svelte";

  function snapshot(): SerialConfig {
    return bridge.activeConfig
      ? { ...bridge.activeConfig }
      : {
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: "none",
          flowControl: "none",
        };
  }

  let config = $state<SerialConfig>(snapshot());
  let applying = $state(false);

  // Snapshot the active config each time the dialog opens so edits start
  // from the current state rather than whatever was last left here.
  $effect(() => {
    if (app.showReconfigure) {
      config = snapshot();
    }
  });

  function close(): void {
    app.showReconfigure = false;
  }

  async function apply(): Promise<void> {
    applying = true;
    try {
      await bridge.reconfigure(config);
      app.showReconfigure = false;
    } catch (err) {
      app.bannerError = (err as Error).message;
    } finally {
      applying = false;
    }
  }
</script>

<Dialog open={app.showReconfigure} onClose={close} label="Reconfigure port" width="w-[34rem]">
  <h2 class="mb-3 font-semibold">Reconfigure port</h2>
  <p class="mb-3 text-xs text-muted">
    Applies new serial parameters to the currently-open port without re-prompting.
  </p>
  <SerialPresetPicker bind:config />
  <SerialConfigForm bind:config />
  <div class="flex justify-end gap-2 text-xs">
    <button class={BUTTON_SECONDARY} onclick={close}>Cancel</button>
    <button class={BUTTON_PRIMARY} disabled={applying} onclick={apply}>Apply</button>
  </div>
</Dialog>
