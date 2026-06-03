<script lang="ts">
  import { app } from "../lib/state.svelte";
  import { bridge } from "../lib/serial-bridge.svelte";

  const label = $derived.by(() => {
    switch (app.connection.kind) {
      case "connected":
        return "Disconnect";
      case "connecting":
        return "Connecting…";
      case "error":
        return "Reconnect";
      default:
        return "Connect";
    }
  });

  async function onClick(): Promise<void> {
    if (app.connection.kind === "connected") {
      await bridge.disconnect();
      app.connection = { kind: "disconnected" };
    } else {
      app.showConnect = true;
    }
  }
</script>

<button
  class="rounded border px-2 py-0.5 text-xs transition"
  class:border-accent={app.connection.kind === "connected"}
  class:text-accent={app.connection.kind === "connected"}
  class:border-divider={app.connection.kind !== "connected"}
  class:text-muted={app.connection.kind !== "connected"}
  class:hover:border-accent={true}
  class:hover:bg-elevated={true}
  disabled={app.connection.kind === "connecting"}
  onclick={onClick}
>
  {label}
</button>
