<script lang="ts">
  import { app } from "../lib/state.svelte";
</script>

{#if app.bannerError}
  <div
    class="border-t border-danger bg-danger/10 px-4 py-2 text-xs text-danger"
    role="alert"
  >
    <span class="font-semibold">Error:</span>
    {app.bannerError}
    <button
      class="ml-2 underline-offset-2 hover:underline"
      onclick={() => (app.bannerError = null)}
    >
      dismiss
    </button>
  </div>
{/if}
