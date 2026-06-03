import {
  WebSerialTransport,
  WebSocketTransport,
  type SerialConfig,
  type SerialTransport,
} from "@emdzej/stm-serial-core";
import type { WorkerOutbound } from "@emdzej/stm-serial-worker";
// Vite resolves the ?worker query and emits a worker entry. The worker file
// just calls runWorker() from the shared package.
import SerialWorker from "./serial-worker.ts?worker";

type DataListener = (bytes: Uint8Array) => void;

interface Metrics {
  rxBytes: number;
  rxRate: number;
  txBytes: number;
}

class SerialBridge {
  metrics = $state<Metrics>({ rxBytes: 0, rxRate: 0, txBytes: 0 });
  activeConfig = $state<SerialConfig | null>(null);
  private transport: SerialTransport | null = null;
  private worker: Worker | null = null;
  private listeners = new Set<DataListener>();

  isOpen(): boolean {
    return this.transport !== null;
  }

  onData(listener: DataListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connectWebSerial(config: SerialConfig): Promise<void> {
    if (!("serial" in navigator)) {
      throw new Error("Web Serial is not available in this browser");
    }
    const port = await navigator.serial.requestPort();
    const transport = new WebSerialTransport(port);
    await this.attach(transport, config);
  }

  async connectTunnel(url: string, token: string | undefined, config: SerialConfig): Promise<void> {
    const transport = new WebSocketTransport({ url, token });
    await this.attach(transport, config);
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.transport) throw new Error("Not connected");
    await this.transport.write(bytes);
    this.metrics.txBytes += bytes.byteLength;
  }

  /** Assert the serial line break for ~250 ms, then release. */
  async sendBreak(durationMs = 250): Promise<void> {
    if (!this.transport) throw new Error("Not connected");
    await this.transport.setSignals({ brk: true });
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await this.transport.setSignals({ brk: false });
  }

  /** Apply a new serial config without prompting for a new port. For
   * transports that support in-place reconfigure (e.g. WebSocket tunnel —
   * keeps the WS alive), uses that; otherwise falls back to close() +
   * open(). The worker is always re-attached to a fresh readable stream. */
  async reconfigure(config: SerialConfig): Promise<void> {
    if (!this.transport) throw new Error("Not connected");
    await this.detachWorker();
    if (this.transport.reconfigure) {
      await this.transport.reconfigure(config);
    } else {
      await this.transport.close();
      await this.transport.open(config);
    }
    this.activeConfig = config;
    this.attachWorker(this.transport);
  }

  async disconnect(): Promise<void> {
    await this.detachWorker();
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[STM] transport close failed:", err);
      }
      this.transport = null;
    }
    this.activeConfig = null;
    this.metrics = { rxBytes: 0, rxRate: 0, txBytes: 0 };
  }

  /** Tell the worker to cancel its reader (releasing the stream lock so the
   * port can be cleanly closed), wait for the `detached` ack, then terminate
   * the worker. A short safety timeout covers the case where the worker is
   * wedged — we'd rather force-terminate than block disconnect forever. */
  private async detachWorker(): Promise<void> {
    if (!this.worker) return;
    const worker = this.worker;
    await new Promise<void>((resolve) => {
      let settled = false;
      const settleOnce = (): void => {
        if (settled) return;
        settled = true;
        worker.removeEventListener("message", handler);
        resolve();
      };
      const handler = (ev: MessageEvent<WorkerOutbound>): void => {
        if (ev.data.kind === "detached") settleOnce();
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ kind: "detach" });
      setTimeout(settleOnce, 500);
    });
    worker.terminate();
    this.worker = null;
  }

  private async attach(transport: SerialTransport, config: SerialConfig): Promise<void> {
    await transport.open(config);
    this.transport = transport;
    this.activeConfig = config;
    this.attachWorker(transport);
    this.metrics = { rxBytes: 0, rxRate: 0, txBytes: 0 };
  }

  private attachWorker(transport: SerialTransport): void {
    const worker = new SerialWorker();
    worker.addEventListener("message", (ev: MessageEvent<WorkerOutbound>) =>
      this.onWorkerMessage(ev.data),
    );
    worker.addEventListener("error", (ev) => {
      // eslint-disable-next-line no-console
      console.error("[STM] worker error:", ev.message);
    });
    const readable = transport.readable;
    worker.postMessage({ kind: "attach", readable }, [readable]);
    this.worker = worker;
  }

  private onWorkerMessage(msg: WorkerOutbound): void {
    switch (msg.kind) {
      case "data":
        for (const l of this.listeners) l(msg.bytes);
        break;
      case "metrics":
        this.metrics.rxBytes = msg.rxBytes;
        this.metrics.rxRate = msg.rxRate;
        break;
      case "error":
        // eslint-disable-next-line no-console
        console.error("[STM] worker:", msg.message);
        break;
      case "detached":
        break;
    }
  }
}

export const bridge = new SerialBridge();
