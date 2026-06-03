<script lang="ts">
  import { tick } from "svelte";

  interface Props {
    /** Items to render — one per row. Mutating the array (push/slice) is fine,
     * Svelte 5 $state proxies make reactivity work. */
    lines: readonly string[];
    /** Pixel height of one row. Must match the line-height applied in CSS. */
    lineHeight?: number;
    /** Extra rows rendered above and below the visible window. Keeps the
     * scroll feeling smooth without bleeding too much DOM. */
    overscan?: number;
    /** Extra classes merged onto the scroll container. */
    class?: string;
  }

  let { lines, lineHeight = 16, overscan = 12, class: extraClass = "" }: Props = $props();

  let container = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  // We "stick to bottom" as long as the user hasn't scrolled away. Threshold
  // of one line height tolerates the asynchronous gap between content
  // arriving and the scroll reaching the new bottom.
  let stickToBottom = $state(true);

  const total = $derived(lines.length);
  const totalHeight = $derived(total * lineHeight);
  const startIdx = $derived(
    Math.max(0, Math.floor(scrollTop / lineHeight) - overscan),
  );
  const endIdx = $derived(
    Math.min(total, Math.ceil((scrollTop + viewportHeight) / lineHeight) + overscan),
  );
  const offsetY = $derived(startIdx * lineHeight);
  const visible = $derived(lines.slice(startIdx, endIdx));

  function onScroll(e: Event): void {
    const el = e.currentTarget as HTMLDivElement;
    scrollTop = el.scrollTop;
    stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < lineHeight;
  }

  // Re-stick to bottom whenever rows are appended and the user is already
  // tracking the tail. `await tick()` lets the spacer div grow before we
  // ask the browser to scroll past it.
  $effect(() => {
    void total;
    if (!stickToBottom || !container) return;
    void tick().then(() => {
      if (container) container.scrollTop = container.scrollHeight;
    });
  });
</script>

<div
  bind:this={container}
  bind:clientHeight={viewportHeight}
  onscroll={onScroll}
  class={`overflow-auto ${extraClass}`}
>
  <div style="height: {totalHeight}px; position: relative;">
    <div
      style="position: absolute; top: 0; left: 0; right: 0; transform: translateY({offsetY}px); will-change: transform;"
    >
      {#each visible as line, i (startIdx + i)}
        <div
          class="whitespace-pre"
          style="height: {lineHeight}px; line-height: {lineHeight}px;"
        >{line}</div>
      {/each}
    </div>
  </div>
</div>
