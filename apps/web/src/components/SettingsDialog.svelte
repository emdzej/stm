<script lang="ts">
  import { Dialog, SegmentedControl, BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { app } from "../lib/state.svelte";
  import { settings } from "../lib/settings.svelte";
  import { logging } from "../lib/logging.svelte";
  import { DEFAULTS, exportJson, importJson, type Settings } from "@emdzej/stm-settings";

  let importError = $state<string | null>(null);

  function openLogs(): void {
    app.showSettings = false;
    app.showLogs = true;
  }

  function close(): void {
    app.showSettings = false;
  }

  /** Apply an imported / reset Settings object into the live $state proxy
   * by mutating in place, preserving nested-object reactivity. Bulk-replacing
   * settings.monitor (etc.) with a non-proxied object would silently break
   * downstream binds. */
  function applySettings(s: Settings): void {
    importError = null;
    settings.schemaVersion = s.schemaVersion;
    settings.theme = s.theme;
    Object.assign(settings.monitor, s.monitor);
    Object.assign(settings.terminal, s.terminal);
    Object.assign(settings.connect, s.connect);
    Object.assign(settings.connect.config, s.connect.config);
    settings.serialPresets = [...s.serialPresets];
    settings.tunnelProfiles = [...s.tunnelProfiles];
  }

  function doExport(): void {
    const blob = new Blob([exportJson(settings)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stm-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        applySettings(importJson(await file.text()));
      } catch (err) {
        importError = (err as Error).message;
      }
    };
    input.click();
  }

  function resetToDefaults(): void {
    if (!confirm("Reset all settings to defaults? Persisted preferences will be lost.")) {
      return;
    }
    applySettings(DEFAULTS);
  }
</script>

<Dialog open={app.showSettings} onClose={close} label="Settings" width="w-[36rem]">
  <h2 class="mb-3 font-semibold">Settings</h2>

  <section class="mb-5">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Monitor</h3>
    <div class="space-y-3 text-xs">
      <div>
        <span class="mb-1 block text-muted">Default line ending</span>
        <SegmentedControl
          options={[
            { value: "none", label: "none" },
            { value: "cr", label: "CR" },
            { value: "lf", label: "LF" },
            { value: "crlf", label: "CRLF" },
            { value: "nul", label: "NUL" },
          ]}
          bind:value={settings.monitor.lineEnding}
        />
      </div>
      <label class="flex items-center gap-2 text-muted">
        <input
          type="checkbox"
          class="rounded border-divider"
          bind:checked={settings.monitor.echoLocal}
        />
        Echo sent bytes locally in the stream view
      </label>
    </div>
  </section>

  <section class="mb-5">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Terminal</h3>
    <div class="space-y-3 text-xs">
      <div>
        <span class="mb-1 block text-muted">Backspace key sends</span>
        <SegmentedControl
          options={[
            { value: "del", label: "DEL (0x7F)", title: "Modern shells, GNU readline default" },
            { value: "ctrl-h", label: "^H (0x08)", title: "Bootloaders, older devices" },
          ]}
          bind:value={settings.terminal.backspaceMode}
        />
      </div>
      <div>
        <span class="mb-1 block text-muted">Cursor style</span>
        <SegmentedControl
          options={[
            { value: "block", label: "Block" },
            { value: "underline", label: "Underline" },
            { value: "bar", label: "Bar" },
          ]}
          bind:value={settings.terminal.cursorStyle}
        />
      </div>
      <div>
        <span class="mb-1 block text-muted">Geometry</span>
        <SegmentedControl
          options={[
            { value: "fit", label: "Fit to container" },
            { value: "fixed", label: "Fixed cols × rows" },
          ]}
          bind:value={settings.terminal.geometry}
        />
      </div>
      {#if settings.terminal.geometry === "fixed"}
        <label class="flex items-center gap-3 text-muted">
          <span class="w-12">Cols</span>
          <input
            type="number"
            min="20"
            max="500"
            class="w-20 rounded border border-divider bg-base px-2 py-1 font-mono"
            bind:value={settings.terminal.cols}
          />
        </label>
        <label class="flex items-center gap-3 text-muted">
          <span class="w-12">Rows</span>
          <input
            type="number"
            min="10"
            max="200"
            class="w-20 rounded border border-divider bg-base px-2 py-1 font-mono"
            bind:value={settings.terminal.rows}
          />
        </label>
      {/if}
      <label class="flex items-center gap-3 text-muted">
        <span>Font size</span>
        <input
          type="number"
          min="8"
          max="32"
          class="w-20 rounded border border-divider bg-base px-2 py-1 font-mono"
          bind:value={settings.terminal.fontSize}
        />
      </label>
      <label class="flex items-center gap-2 text-muted">
        <input
          type="checkbox"
          class="rounded border-divider"
          bind:checked={settings.terminal.localEcho}
        />
        Local echo (useful for devices that don't echo input)
      </label>
      <label class="flex items-center gap-2 text-muted">
        <input
          type="checkbox"
          class="rounded border-divider"
          bind:checked={settings.terminal.eightBitClean}
        />
        8-bit clean (off → strip high bit on incoming bytes)
      </label>
    </div>
  </section>

  <section class="mb-5">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
      Session logs
    </h3>
    <div class="space-y-2 text-xs">
      {#if !logging.available}
        <p class="text-warning">
          OPFS / IndexedDB isn't available in this browser, so session logging
          can't be enabled.
        </p>
      {:else}
        <label class="flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            class="rounded border-divider"
            bind:checked={settings.logging.enabled}
          />
          Record every connected session's incoming bytes
        </label>
        <div class="flex items-center gap-2">
          <button class={BUTTON_SECONDARY} onclick={openLogs}>Browse logs…</button>
          {#if logging.current}
            <span class="text-faint">
              Recording <span class="font-mono">{logging.current.id.slice(0, 19)}</span>
              ({logging.current.byteCount.toLocaleString()} B)
            </span>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <section class="mb-5">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
      Serial presets
    </h3>
    {#if settings.serialPresets.length === 0}
      <p class="text-xs text-faint">
        No saved presets. Save one from the Connect or Reconfigure dialog.
      </p>
    {:else}
      <div class="space-y-2 text-xs">
        {#each settings.serialPresets as p, idx (p.id)}
          <div class="flex flex-wrap items-center gap-2">
            <input
              type="text"
              class="w-32 rounded border border-divider bg-base px-2 py-1 font-mono"
              bind:value={settings.serialPresets[idx].name}
              placeholder="Name"
            />
            <span class="flex-1 font-mono text-faint">
              {p.baudRate} {p.dataBits}{p.parity[0].toUpperCase()}{p.stopBits}
              · flow:{p.flowControl}
            </span>
            <button
              class="rounded border border-danger bg-surface px-2 py-0.5 text-danger transition hover:bg-danger/10"
              onclick={() => {
                if (confirm(`Delete serial preset "${p.name}"?`)) {
                  settings.serialPresets = settings.serialPresets.filter(
                    (x) => x.id !== p.id,
                  );
                }
              }}
            >
              Remove
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="mb-5">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
      Macros
    </h3>
    <p class="mb-2 text-xs text-faint">
      Named byte sequences callable from Monitor and Terminal toolbars. Payload
      supports <code class="font-mono">\r</code> <code class="font-mono">\n</code>
      <code class="font-mono">\t</code> <code class="font-mono">\0</code>
      <code class="font-mono">\\</code> and <code class="font-mono">\xNN</code>
      escapes.
    </p>
    <div class="space-y-2 text-xs">
      {#each settings.macros as m, idx (m.id)}
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="text"
            class="w-28 rounded border border-divider bg-base px-2 py-1 font-mono"
            bind:value={settings.macros[idx].name}
            placeholder="Name"
          />
          <input
            type="text"
            class="flex-1 min-w-[12rem] rounded border border-divider bg-base px-2 py-1 font-mono"
            bind:value={settings.macros[idx].payload}
            placeholder="e.g. AT+CSQ\r"
          />
          <button
            class="rounded border border-danger bg-surface px-2 py-0.5 text-danger transition hover:bg-danger/10"
            onclick={() => {
              if (confirm(`Delete macro "${m.name}"?`)) {
                settings.macros = settings.macros.filter((x) => x.id !== m.id);
              }
            }}
            title="Delete macro"
          >
            Remove
          </button>
        </div>
      {/each}
      <button
        class={BUTTON_SECONDARY}
        onclick={() => {
          settings.macros = [
            ...settings.macros,
            { id: crypto.randomUUID(), name: "New macro", payload: "" },
          ];
        }}
      >
        + Add macro
      </button>
    </div>
  </section>

  <section class="mb-5">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
      Tunnel profiles
    </h3>
    {#if settings.tunnelProfiles.length === 0}
      <p class="text-xs text-faint">
        No saved tunnel profiles yet. Save one from the Connect dialog while the
        WebSocket tunnel transport is selected.
      </p>
    {:else}
      <div class="space-y-2 text-xs">
        {#each settings.tunnelProfiles as p, idx (p.id)}
          <div class="flex flex-wrap items-center gap-2">
            <input
              type="text"
              class="w-28 rounded border border-divider bg-base px-2 py-1 font-mono"
              bind:value={settings.tunnelProfiles[idx].name}
              placeholder="Name"
            />
            <input
              type="text"
              class="flex-1 min-w-[12rem] rounded border border-divider bg-base px-2 py-1 font-mono"
              bind:value={settings.tunnelProfiles[idx].url}
              placeholder="ws://host:port"
            />
            <input
              type="password"
              class="w-28 rounded border border-divider bg-base px-2 py-1 font-mono"
              bind:value={settings.tunnelProfiles[idx].token}
              placeholder="token"
            />
            <button
              class="rounded border border-danger bg-surface px-2 py-0.5 text-danger transition hover:bg-danger/10"
              onclick={() => {
                if (confirm(`Delete tunnel profile "${p.name}"?`)) {
                  settings.tunnelProfiles = settings.tunnelProfiles.filter(
                    (x) => x.id !== p.id,
                  );
                }
              }}
              title="Delete profile"
            >
              Remove
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="mb-5">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
      Settings data
    </h3>
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <button class={BUTTON_SECONDARY} onclick={doExport}>Export JSON</button>
      <button class={BUTTON_SECONDARY} onclick={doImport}>Import JSON…</button>
      <span class="flex-1"></span>
      <button
        class="rounded border border-warning bg-surface px-2 py-0.5 text-warning transition hover:bg-warning/10"
        onclick={resetToDefaults}
      >
        Reset to defaults
      </button>
    </div>
    {#if importError}
      <p class="mt-2 text-xs text-danger">Import failed: {importError}</p>
    {/if}
  </section>

  <div class="flex justify-end gap-2 text-xs">
    <button class={BUTTON_SECONDARY} onclick={close}>Close</button>
  </div>
</Dialog>
