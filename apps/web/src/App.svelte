<script lang="ts">
  import { SegmentedControl } from "@emdzej/stm-ui";
  import { app } from "./lib/state.svelte";
  import { bridge } from "./lib/serial-bridge.svelte";
  import { installAutoSave, settings } from "./lib/settings.svelte";
  import { installThemeApplier } from "./lib/theme.svelte";
  import { installLogging } from "./lib/logging.svelte";
  import ConnectButton from "./components/ConnectButton.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ConnectDialog from "./components/ConnectDialog.svelte";
  import ReconfigureDialog from "./components/ReconfigureDialog.svelte";
  import LogsDialog from "./components/LogsDialog.svelte";
  import ZmodemDialog from "./components/ZmodemDialog.svelte";
  import ErrorBanner from "./components/ErrorBanner.svelte";
  import HomeView from "./components/HomeView.svelte";
  import MonitorView from "./components/MonitorView.svelte";
  import TerminalView from "./components/TerminalView.svelte";
  import ThemeSwitch from "./components/ThemeSwitch.svelte";

  installAutoSave();
  installThemeApplier();
  installLogging();

  function home(): void {
    app.view = "home";
  }

  /** Compact "115200 8N1" notation matching the convention used in port
   * config dialogs. */
  function portShort(c: { baudRate: number; dataBits: number; parity: string; stopBits: number }): string {
    return `${c.baudRate} ${c.dataBits}${c.parity[0].toUpperCase()}${c.stopBits}`;
  }
</script>

<div class="flex h-full flex-col bg-base text-foreground">
  <header
    class="flex items-center gap-4 border-b border-divider bg-surface px-4 py-2 text-sm"
  >
    <button
      class="font-semibold text-accent transition hover:text-accent-muted"
      onclick={home}
    >
      STM
    </button>
    <a
      href="https://github.com/emdzej/stm/releases/tag/{__APP_VERSION__}"
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-faint underline-offset-2 transition hover:text-foreground hover:underline"
      title="Release notes for {__APP_VERSION__}"
    >
      {__APP_VERSION__}
    </a>
    <a
      href="https://github.com/emdzej/stm"
      target="_blank"
      rel="noopener noreferrer"
      class="text-faint transition hover:text-foreground"
      title="STM on GitHub"
      aria-label="STM on GitHub"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    </a>

    {#if app.view !== "home"}
      <SegmentedControl
        class="ml-2 text-xs"
        options={[
          { value: "monitor", label: "Monitor" },
          { value: "terminal", label: "Terminal" },
        ]}
        value={app.view === "terminal" ? "terminal" : "monitor"}
        onchange={(v) => (app.view = v)}
      />
    {/if}

    <span class="flex-1"></span>

    {#if bridge.activeConfig}
      <button
        class="rounded border border-divider bg-surface px-2 py-0.5 font-mono text-xs text-muted transition hover:border-accent hover:bg-elevated"
        onclick={() => (app.showReconfigure = true)}
        title="Reconfigure port"
      >
        {portShort(bridge.activeConfig)}
      </button>
    {/if}

    <ThemeSwitch />
    <ConnectButton />
    <button
      type="button"
      class="rounded p-1 text-faint transition hover:text-foreground"
      onclick={() => (app.showSettings = true)}
      title="Settings"
      aria-label="Settings"
    >
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
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  </header>

  <main class="flex-1 overflow-hidden">
    {#if app.view === "home"}
      <HomeView />
    {:else if app.view === "monitor"}
      <MonitorView />
    {:else if app.view === "terminal"}
      <TerminalView />
    {/if}
  </main>

  <ErrorBanner />
  <ConnectDialog />
  <ReconfigureDialog />
  <SettingsDialog />
  <LogsDialog />
  <ZmodemDialog />
</div>
