import { LoggingService, type SessionMeta, isOpfsAvailable } from "@emdzej/stm-logging";
import { bridge } from "./serial-bridge.svelte";
import { settings } from "./settings.svelte";

/**
 * Reactive Svelte wrapper around the LoggingService. The service itself
 * lives in @emdzej/stm-logging and is framework-agnostic; this layer adds
 * the $state mirrors the UI binds to.
 */
class ReactiveLogging {
  current = $state<SessionMeta | null>(null);
  available = $state(isOpfsAvailable() && typeof indexedDB !== "undefined");
  private svc = new LoggingService();

  async start(
    cfg: { baudRate: number; dataBits: number; stopBits: number; parity: string; flowControl: string },
    transport: "web-serial" | "tunnel",
  ): Promise<void> {
    if (!this.available || this.current) return;
    try {
      const meta = await this.svc.start({ config: cfg, transport });
      // Shallow copy so this.current is a separate object — the service
      // mutates its own meta for IDB persistence; this wrapper owns the
      // reactive mirror that the UI binds to.
      this.current = { ...meta };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[STM] logging start failed:", err);
    }
  }

  async stop(): Promise<void> {
    if (!this.current) return;
    try {
      await this.svc.stop();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[STM] logging stop failed:", err);
    }
    this.current = null;
  }

  append(bytes: Uint8Array): void {
    this.svc.append(bytes);
    // Mirror the count so the UI sees live progress. Both the wrapper and
    // the service increment by the same delta on the same code path, so
    // they stay in sync; the service's value is what lands in IDB on stop.
    if (this.current) {
      this.current.byteCount += bytes.byteLength;
    }
  }

  list(): Promise<SessionMeta[]> {
    return this.svc.list();
  }

  exportBlob(id: string): Promise<Blob> {
    return this.svc.exportBlob(id);
  }

  deleteOne(id: string): Promise<void> {
    return this.svc.deleteOne(id);
  }

  setLabel(id: string, label: string): Promise<void> {
    return this.svc.setLabel(id, label);
  }
}

export const logging = new ReactiveLogging();

/** Install logging hooks. Must be called from a component setup context
 * because of `$effect`. */
export function installLogging(): void {
  if (!logging.available) return;

  // Subscribe to every chunk. The append check is cheap when no session
  // is active, so we don't bother unsubscribing as settings change.
  bridge.onData((bytes) => {
    if (logging.current) logging.append(bytes);
  });

  // Open/close sessions in response to connection state and the toggle.
  $effect(() => {
    const cfg = bridge.activeConfig;
    const enabled = settings.logging.enabled;
    if (cfg && enabled && !logging.current) {
      void logging.start(
        {
          baudRate: cfg.baudRate,
          dataBits: cfg.dataBits,
          stopBits: cfg.stopBits,
          parity: cfg.parity,
          flowControl: cfg.flowControl,
        },
        settings.connect.transport,
      );
    } else if ((!cfg || !enabled) && logging.current) {
      void logging.stop();
    }
  });
}
