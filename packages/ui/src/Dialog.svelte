<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
    label: string;
    /** Tailwind width class for the dialog box. */
    width?: string;
    children: Snippet;
  }

  let { open, onClose, label, width = "w-[28rem]", children }: Props = $props();

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={open ? onKey : undefined} />

{#if open}
  <div class="fixed inset-0 z-50">
    <button
      type="button"
      class="absolute inset-0 bg-black/50"
      aria-label="Close dialog"
      onclick={onClose}
    ></button>
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div
        class="pointer-events-auto {width} max-h-full max-w-full overflow-y-auto rounded border border-divider bg-surface p-4 text-sm shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {@render children()}
      </div>
    </div>
  </div>
{/if}
