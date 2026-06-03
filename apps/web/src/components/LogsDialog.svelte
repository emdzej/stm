<script lang="ts">
  import { Dialog, BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { app } from "../lib/state.svelte";
  import { logging } from "../lib/logging.svelte";
  import type { SessionMeta } from "@emdzej/stm-logging";

  let sessions = $state<SessionMeta[]>([]);
  let loading = $state(false);
  let editingId = $state<string | null>(null);
  let editingLabel = $state("");

  // Refresh whenever the dialog opens or a session is started / stopped.
  $effect(() => {
    if (app.showLogs) {
      void refresh();
    }
  });

  // Re-fetch when the active session changes (start/stop), so the list shows
  // the in-progress recording without manual refresh.
  $effect(() => {
    if (app.showLogs) {
      // Touch logging.current so the effect re-runs on changes.
      void logging.current;
      void refresh();
    }
  });

  async function refresh(): Promise<void> {
    if (!logging.available) return;
    loading = true;
    try {
      sessions = await logging.list();
    } finally {
      loading = false;
    }
  }

  function close(): void {
    app.showLogs = false;
  }

  function formatTimestamp(ms: number): string {
    return new Date(ms).toLocaleString();
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuration(started: number, ended?: number): string {
    if (!ended) return "in progress";
    const ms = ended - started;
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
    return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  }

  async function exportSession(s: SessionMeta): Promise<void> {
    try {
      const blob = await logging.exportBlob(s.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const name = s.label
        ? `stm-${s.label.replace(/\s+/g, "_")}-${s.id}.bin`
        : `stm-${s.id}.bin`;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      app.bannerError = (err as Error).message;
    }
  }

  async function deleteSession(s: SessionMeta): Promise<void> {
    if (logging.current?.id === s.id) {
      app.bannerError = "Disconnect first to delete the in-progress session.";
      return;
    }
    if (!confirm(`Delete session ${s.label ?? s.id}? This removes the OPFS file.`)) return;
    try {
      await logging.deleteOne(s.id);
      await refresh();
    } catch (err) {
      app.bannerError = (err as Error).message;
    }
  }

  function startEditLabel(s: SessionMeta): void {
    editingId = s.id;
    editingLabel = s.label ?? "";
  }

  async function commitEditLabel(): Promise<void> {
    if (!editingId) return;
    await logging.setLabel(editingId, editingLabel.trim());
    editingId = null;
    await refresh();
  }

  function cancelEditLabel(): void {
    editingId = null;
    editingLabel = "";
  }
</script>

<Dialog open={app.showLogs} onClose={close} label="Session logs" width="w-[48rem]">
  <div class="mb-3 flex items-center gap-2">
    <h2 class="font-semibold">Session logs</h2>
    <span class="flex-1"></span>
    <button class={BUTTON_SECONDARY} onclick={refresh} disabled={loading}>
      {loading ? "Loading…" : "Refresh"}
    </button>
  </div>

  {#if !logging.available}
    <p class="text-xs text-warning">
      OPFS / IndexedDB isn't available in this browser, so session logging is
      disabled.
    </p>
  {:else if sessions.length === 0}
    <p class="text-xs text-faint">
      No recorded sessions yet. Enable logging under Settings → Session logs,
      then connect to a device.
    </p>
  {:else}
    <div class="space-y-2 text-xs">
      {#each sessions as s (s.id)}
        {@const isCurrent = logging.current?.id === s.id}
        <div
          class="rounded border bg-surface px-3 py-2"
          class:border-divider={!isCurrent}
          class:border-accent={isCurrent}
        >
          <div class="mb-1 flex items-baseline gap-2">
            {#if editingId === s.id}
              <input
                type="text"
                class="flex-1 rounded border border-divider bg-base px-2 py-0.5 font-mono"
                bind:value={editingLabel}
                placeholder="Label"
                onkeydown={(e) => {
                  if (e.key === "Enter") void commitEditLabel();
                  if (e.key === "Escape") cancelEditLabel();
                }}
              />
              <button class={BUTTON_SECONDARY} onclick={commitEditLabel}>Save</button>
              <button class={BUTTON_SECONDARY} onclick={cancelEditLabel}>Cancel</button>
            {:else}
              <button
                class="font-semibold text-foreground transition hover:text-accent"
                onclick={() => startEditLabel(s)}
                title="Click to edit label"
              >
                {s.label || "(unlabelled)"}
              </button>
              {#if isCurrent}
                <span class="rounded bg-accent px-1.5 py-0.5 text-[10px] text-white">
                  RECORDING
                </span>
              {/if}
              <span class="flex-1"></span>
              <button class={BUTTON_SECONDARY} onclick={() => exportSession(s)}>
                Export
              </button>
              <button
                class="rounded border border-danger bg-surface px-2 py-0.5 text-danger transition hover:bg-danger/10"
                onclick={() => deleteSession(s)}
              >
                Delete
              </button>
            {/if}
          </div>
          <div class="font-mono text-faint">
            {formatTimestamp(s.startedAt)} · {formatDuration(s.startedAt, s.endedAt)}
            · {formatBytes(s.byteCount)}
            {#if s.transport}· {s.transport}{/if}
            {#if s.config}· {s.config.baudRate} {s.config.dataBits}{s.config.parity[0].toUpperCase()}{s.config.stopBits}{/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="mt-4 flex justify-end">
    <button class={BUTTON_SECONDARY} onclick={close}>Close</button>
  </div>
</Dialog>
