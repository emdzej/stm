<script lang="ts">
  import { SegmentedControl } from "@emdzej/stm-ui";
  import type { SerialConfig } from "@emdzej/stm-serial-core";

  interface Props {
    config: SerialConfig;
  }
  let { config = $bindable() }: Props = $props();

  const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600] as const;
</script>

<div class="mb-3 text-xs">
  <span class="mb-1 block text-muted">Baud</span>
  <div class="flex flex-wrap items-center gap-2">
    <SegmentedControl
      class="flex-wrap"
      options={BAUDS.map((b) => ({ value: b, label: String(b) }))}
      bind:value={config.baudRate}
    />
    <input
      type="number"
      min="50"
      step="1"
      class="w-24 rounded border border-divider bg-base px-2 py-1 font-mono"
      placeholder="custom"
      value={config.baudRate}
      oninput={(e) => {
        const n = Number((e.currentTarget as HTMLInputElement).value);
        if (Number.isFinite(n) && n > 0) config.baudRate = n;
      }}
    />
  </div>
</div>

<div class="mb-4 grid grid-cols-2 gap-3 text-xs">
  <div>
    <span class="mb-1 block text-muted">Data bits</span>
    <SegmentedControl
      options={[
        { value: 7, label: "7" },
        { value: 8, label: "8" },
      ]}
      bind:value={config.dataBits}
    />
  </div>
  <div>
    <span class="mb-1 block text-muted">Stop bits</span>
    <SegmentedControl
      options={[
        { value: 1, label: "1" },
        { value: 2, label: "2" },
      ]}
      bind:value={config.stopBits}
    />
  </div>
  <div>
    <span class="mb-1 block text-muted">Parity</span>
    <SegmentedControl
      options={[
        { value: "none", label: "none" },
        { value: "even", label: "even" },
        { value: "odd", label: "odd" },
      ]}
      bind:value={config.parity}
    />
  </div>
  <div>
    <span class="mb-1 block text-muted">Flow control</span>
    <SegmentedControl
      options={[
        { value: "none", label: "none" },
        { value: "hardware", label: "hardware" },
      ]}
      bind:value={config.flowControl}
    />
  </div>
</div>
