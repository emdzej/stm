/// <reference lib="webworker" />
import type { WorkerInbound, WorkerOutbound } from "./protocol.js";

const FLUSH_INTERVAL_MS = 16; // ~60 Hz: smooth UI without burning CPU
const FLUSH_HIGH_WATER = 64 * 1024;
const METRICS_INTERVAL_MS = 1000;

/**
 * Run the serial-worker message loop on the current global scope.
 * Intended to be called from a Vite `?worker` entry inside an app.
 */
export function runWorker(scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope): void {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let pending: Uint8Array[] = [];
  let pendingLength = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  let rxBytesTotal = 0;
  let rxBytesWindow = 0;
  let metricsTimer: ReturnType<typeof setInterval> | null = null;

  function post(msg: WorkerOutbound, transfer: Transferable[] = []): void {
    scope.postMessage(msg, transfer);
  }

  function flush(): void {
    if (pending.length === 0) return;
    const out = pending.length === 1 ? pending[0] : concat(pending, pendingLength);
    pending = [];
    pendingLength = 0;
    post({ kind: "data", bytes: out }, [out.buffer]);
  }

  function scheduleFlush(): void {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }

  async function readLoop(r: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      while (true) {
        const { value, done } = await r.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        pending.push(value);
        pendingLength += value.byteLength;
        rxBytesTotal += value.byteLength;
        rxBytesWindow += value.byteLength;
        if (pendingLength >= FLUSH_HIGH_WATER) {
          if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          flush();
        } else {
          scheduleFlush();
        }
      }
      flush();
      post({ kind: "detached" });
    } catch (err) {
      post({ kind: "error", message: (err as Error).message });
    } finally {
      reader = null;
    }
  }

  function startMetrics(): void {
    if (metricsTimer !== null) return;
    metricsTimer = setInterval(() => {
      const rate = (rxBytesWindow * 1000) / METRICS_INTERVAL_MS;
      rxBytesWindow = 0;
      post({ kind: "metrics", rxBytes: rxBytesTotal, rxRate: rate });
    }, METRICS_INTERVAL_MS);
  }

  function stopMetrics(): void {
    if (metricsTimer !== null) {
      clearInterval(metricsTimer);
      metricsTimer = null;
    }
  }

  scope.addEventListener("message", async (ev: MessageEvent<WorkerInbound>) => {
    const msg = ev.data;
    switch (msg.kind) {
      case "attach": {
        if (reader) {
          post({ kind: "error", message: "Worker already attached" });
          return;
        }
        reader = msg.readable.getReader();
        rxBytesTotal = 0;
        rxBytesWindow = 0;
        startMetrics();
        readLoop(reader);
        break;
      }
      case "detach": {
        stopMetrics();
        if (reader) {
          await reader.cancel().catch(() => {});
          reader = null;
        }
        flush();
        post({ kind: "detached" });
        break;
      }
    }
  });
}

function concat(parts: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}
