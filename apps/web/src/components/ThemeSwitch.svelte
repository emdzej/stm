<script lang="ts">
  import { settings } from "../lib/settings.svelte";
  import type { ThemeChoice } from "@emdzej/stm-settings";

  function setTheme(value: ThemeChoice): void {
    settings.theme = value;
  }

  const items: { value: ThemeChoice; title: string }[] = [
    { value: "system", title: "Follow OS preference" },
    { value: "light", title: "Light theme" },
    { value: "dark", title: "Dark theme" },
  ];

  function btnClass(active: boolean): string {
    return active
      ? "rounded p-1 text-accent transition"
      : "rounded p-1 text-faint transition hover:text-foreground";
  }
</script>

<div class="flex items-center gap-0.5">
  {#each items as item (item.value)}
    {@const active = settings.theme === item.value}
    <button
      type="button"
      class={btnClass(active)}
      title={item.title}
      aria-pressed={active}
      aria-label={item.title}
      onclick={() => setTheme(item.value)}
    >
      {#if item.value === "system"}
        <!-- Monitor / display -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      {:else if item.value === "light"}
        <!-- Sun -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
        </svg>
      {:else}
        <!-- Moon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      {/if}
    </button>
  {/each}
</div>
