<script lang="ts">
  import { BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { settings } from "../lib/settings.svelte";
  import type { SerialPortConfig } from "@emdzej/stm-settings";

  interface Props {
    config: SerialPortConfig;
  }
  let { config = $bindable() }: Props = $props();

  let savingName = $state<string | null>(null);

  function pickPreset(id: string): void {
    if (!id) return;
    const p = settings.serialPresets.find((x) => x.id === id);
    if (!p) return;
    config.baudRate = p.baudRate;
    config.dataBits = p.dataBits;
    config.stopBits = p.stopBits;
    config.parity = p.parity;
    config.flowControl = p.flowControl;
  }

  function startSave(): void {
    savingName = "";
  }

  function cancelSave(): void {
    savingName = null;
  }

  function confirmSave(): void {
    if (!savingName) return;
    settings.serialPresets = [
      ...settings.serialPresets,
      {
        id: crypto.randomUUID(),
        name: savingName,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        flowControl: config.flowControl,
      },
    ];
    savingName = null;
  }

  function summary(p: { baudRate: number; dataBits: number; parity: string; stopBits: number }): string {
    return `${p.baudRate} ${p.dataBits}${p.parity[0].toUpperCase()}${p.stopBits}`;
  }
</script>

{#if settings.serialPresets.length > 0 || savingName !== null}
  <div class="mb-3 flex items-center gap-2 text-xs">
    <span class="text-muted">Preset</span>
    <select
      class="flex-1 rounded border border-divider bg-base px-2 py-1 font-mono"
      onchange={(e) => pickPreset((e.currentTarget as HTMLSelectElement).value)}
    >
      <option value="">(custom)</option>
      {#each settings.serialPresets as p (p.id)}
        <option value={p.id}>{p.name} — {summary(p)}</option>
      {/each}
    </select>
    {#if savingName === null}
      <button class={BUTTON_SECONDARY} onclick={startSave}>Save as…</button>
    {:else}
      <input
        type="text"
        placeholder="Preset name"
        class="w-32 rounded border border-divider bg-base px-2 py-1 font-mono"
        bind:value={savingName}
        onkeydown={(e) => e.key === "Enter" && confirmSave()}
      />
      <button class={BUTTON_SECONDARY} disabled={!savingName} onclick={confirmSave}>
        Save
      </button>
      <button class={BUTTON_SECONDARY} onclick={cancelSave}>Cancel</button>
    {/if}
  </div>
{:else}
  <div class="mb-2 flex justify-end text-xs">
    <button class={BUTTON_SECONDARY} onclick={startSave}>Save as preset…</button>
  </div>
{/if}
