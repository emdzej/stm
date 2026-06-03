<script lang="ts">
  import { Dialog, SegmentedControl, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@emdzej/stm-ui";
  import { app } from "../lib/state.svelte";
  import { bridge } from "../lib/serial-bridge.svelte";
  import { settings } from "../lib/settings.svelte";
  import { isWebSerialAvailable } from "@emdzej/stm-serial-core";
  import SerialConfigForm from "./SerialConfigForm.svelte";

  // Persisted transport choice could refer to Web Serial in a browser that
  // doesn't actually support it (e.g. user reopened on Firefox). Force-flip
  // to tunnel so the form starts in a usable state.
  if (settings.connect.transport === "web-serial" && !isWebSerialAvailable()) {
    settings.connect.transport = "tunnel";
  }

  let selectedProfileId = $state<string | "new">("new");
  let savingName = $state<string | null>(null);

  function close(): void {
    app.showConnect = false;
  }

  function pickProfile(id: string): void {
    selectedProfileId = id;
    if (id === "new") return;
    const profile = settings.tunnelProfiles.find((p) => p.id === id);
    if (profile) {
      settings.connect.tunnelUrl = profile.url;
      settings.connect.tunnelToken = profile.token ?? "";
    }
  }

  function startSaveProfile(): void {
    savingName = "";
  }

  function cancelSaveProfile(): void {
    savingName = null;
  }

  function confirmSaveProfile(): void {
    if (!savingName) return;
    const id = crypto.randomUUID();
    settings.tunnelProfiles = [
      ...settings.tunnelProfiles,
      {
        id,
        name: savingName,
        url: settings.connect.tunnelUrl,
        token: settings.connect.tunnelToken,
      },
    ];
    selectedProfileId = id;
    savingName = null;
  }

  async function connect(): Promise<void> {
    const transport = settings.connect.transport;
    app.connection = { kind: "connecting", transport };
    try {
      if (transport === "web-serial") {
        await bridge.connectWebSerial(settings.connect.config);
      } else {
        await bridge.connectTunnel(
          settings.connect.tunnelUrl,
          settings.connect.tunnelToken || undefined,
          settings.connect.config,
        );
      }
      app.connection = { kind: "connected", transport };
      app.view = "monitor";
      app.showConnect = false;
    } catch (err) {
      const message = (err as Error).message;
      app.connection = { kind: "error", transport, error: message };
      app.bannerError = message;
    }
  }
</script>

<Dialog open={app.showConnect} onClose={close} label="Connect" width="w-[34rem]">
  <h2 class="mb-3 font-semibold">Connect</h2>

  <SegmentedControl
    class="mb-3"
    options={[
      {
        value: "web-serial",
        label: "Web Serial",
        disabled: !isWebSerialAvailable(),
        title: isWebSerialAvailable() ? undefined : "Not supported in this browser",
      },
      { value: "tunnel", label: "WebSocket tunnel" },
    ]}
    bind:value={settings.connect.transport}
  />

  {#if !isWebSerialAvailable() && settings.connect.transport === "web-serial"}
    <p class="mb-3 text-xs text-warning">
      Web Serial isn't available in this browser. Use Chromium / Edge, or pick the
      WebSocket tunnel.
    </p>
  {/if}

  {#if settings.connect.transport === "tunnel"}
    {#if settings.tunnelProfiles.length > 0 || savingName !== null}
      <div class="mb-2 flex items-center gap-2 text-xs">
        <span class="text-muted">Profile</span>
        <select
          value={selectedProfileId}
          onchange={(e) => pickProfile((e.currentTarget as HTMLSelectElement).value)}
          class="flex-1 rounded border border-divider bg-base px-2 py-1 font-mono"
        >
          <option value="new">New connection</option>
          {#each settings.tunnelProfiles as p (p.id)}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
        {#if savingName === null}
          <button class={BUTTON_SECONDARY} onclick={startSaveProfile}>Save as new…</button>
        {:else}
          <input
            type="text"
            placeholder="Profile name"
            class="w-32 rounded border border-divider bg-base px-2 py-1 font-mono"
            bind:value={savingName}
            onkeydown={(e) => e.key === "Enter" && confirmSaveProfile()}
          />
          <button class={BUTTON_SECONDARY} disabled={!savingName} onclick={confirmSaveProfile}>
            Save
          </button>
          <button class={BUTTON_SECONDARY} onclick={cancelSaveProfile}>Cancel</button>
        {/if}
      </div>
    {:else}
      <div class="mb-2 flex justify-end text-xs">
        <button class={BUTTON_SECONDARY} onclick={startSaveProfile}>Save as profile…</button>
      </div>
    {/if}
    <label class="mb-2 block text-xs">
      <span class="block text-muted">Tunnel URL</span>
      <input
        type="text"
        class="mt-1 w-full rounded border border-divider bg-base px-2 py-1 font-mono"
        bind:value={settings.connect.tunnelUrl}
        placeholder="ws://127.0.0.1:8787"
      />
    </label>
    <label class="mb-2 block text-xs">
      <span class="block text-muted">Token (optional)</span>
      <input
        type="password"
        class="mt-1 w-full rounded border border-divider bg-base px-2 py-1 font-mono"
        bind:value={settings.connect.tunnelToken}
      />
    </label>
    <div class="mb-3 rounded border border-divider bg-base px-2 py-2 text-xs text-muted">
      <div class="mb-1 text-faint">
        Run on the host with the device attached:
      </div>
      <code class="block font-mono text-foreground">
        stm-tunnel --port /dev/ttyUSB0 --listen 127.0.0.1:8787
      </code>
      <div class="mt-1 text-faint">
        For remote access add <code class="font-mono">--token &lt;secret&gt;</code> and bind
        a non-loopback host. <code class="font-mono">--tls-cert/--tls-key</code> for
        <code class="font-mono">wss://</code>.
      </div>
    </div>
  {/if}

  <SerialConfigForm bind:config={settings.connect.config} />

  <div class="flex justify-end gap-2 text-xs">
    <button class={BUTTON_SECONDARY} onclick={close}>Cancel</button>
    <button class={BUTTON_PRIMARY} disabled={app.connection.kind === "connecting"} onclick={connect}>
      Connect
    </button>
  </div>
</Dialog>
