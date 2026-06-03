<script lang="ts">
  import { BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { settings } from "../lib/settings.svelte";
  import { compileMacro } from "../lib/macros";
  import { bridge } from "../lib/serial-bridge.svelte";
  import { app } from "../lib/state.svelte";

  function openSettings(): void {
    app.showSettings = true;
  }

  async function runMacro(id: string): Promise<void> {
    const m = settings.macros.find((x) => x.id === id);
    if (!m) return;
    try {
      await bridge.write(compileMacro(m.payload));
    } catch (err) {
      app.bannerError = (err as Error).message;
    }
  }
</script>

{#if settings.macros.length === 0}
  <button class={BUTTON_SECONDARY} title="Define macros in Settings" onclick={openSettings}>
    Macros…
  </button>
{:else}
  <select
    class="rounded border border-divider bg-surface px-2 py-0.5 text-muted transition hover:border-rule hover:bg-elevated hover:text-foreground"
    title="Run a saved macro"
    onchange={(e) => {
      const id = (e.currentTarget as HTMLSelectElement).value;
      if (id) {
        void runMacro(id);
        (e.currentTarget as HTMLSelectElement).value = "";
      }
    }}
  >
    <option value="">Macros…</option>
    {#each settings.macros as m (m.id)}
      <option value={m.id}>{m.name}</option>
    {/each}
  </select>
{/if}
