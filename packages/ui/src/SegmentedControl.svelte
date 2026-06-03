<script lang="ts" generics="T extends string | number">
  import type { SegmentedOption } from "./types.js";

  interface Props {
    options: readonly SegmentedOption<T>[];
    value: T;
    onchange?: (value: T) => void;
    /** Extra classes to merge onto the outer container. */
    class?: string;
  }

  let { options, value = $bindable(), onchange, class: extraClass = "" }: Props = $props();

  function select(opt: SegmentedOption<T>): void {
    if (opt.disabled) return;
    if (value === opt.value) return;
    value = opt.value;
    onchange?.(opt.value);
  }
</script>

<div class={`flex gap-1 rounded border border-divider bg-elevated p-0.5 ${extraClass}`}>
  {#each options as opt (opt.value)}
    <button
      type="button"
      class="rounded px-2 py-0.5 transition"
      class:bg-accent={value === opt.value}
      class:text-white={value === opt.value}
      class:text-muted={value !== opt.value}
      class:hover:text-foreground={value !== opt.value && !opt.disabled}
      class:opacity-50={opt.disabled}
      disabled={opt.disabled}
      title={opt.title}
      onclick={() => select(opt)}
    >
      {opt.label}
    </button>
  {/each}
</div>
