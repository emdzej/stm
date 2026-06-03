import type {
  SerialConfig,
  SerialSignals,
  SerialTransport,
  TransportEvent,
  TransportState,
} from "./types.js";

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export class WebSerialTransport implements SerialTransport {
  private _state: TransportState = { kind: "closed" };
  private listeners = new Set<(e: TransportEvent) => void>();
  private port: SerialPort;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readableTap: ReadableStream<Uint8Array> | null = null;

  constructor(port: SerialPort) {
    this.port = port;
  }

  get state(): TransportState {
    return this._state;
  }

  get readable(): ReadableStream<Uint8Array> {
    if (!this.readableTap) {
      throw new Error("Transport is not open");
    }
    return this.readableTap;
  }

  async open(config: SerialConfig): Promise<void> {
    this.setState({ kind: "opening" });
    await this.port.open({
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      flowControl: config.flowControl,
    });
    if (!this.port.readable || !this.port.writable) {
      throw new Error("Port opened without streams");
    }
    this.readableTap = this.port.readable;
    this.writer = this.port.writable.getWriter();
    this.setState({ kind: "open", config });
  }

  async close(): Promise<void> {
    this.setState({ kind: "closing" });
    try {
      if (this.writer) {
        // Try a graceful close (flushes pending writes); fall through on
        // error so we still release the lock and close the port.
        try {
          await this.writer.close();
        } catch {
          // pending writes may have errored — proceed to releaseLock
        }
        try {
          this.writer.releaseLock();
        } catch {
          // already released (writer.close releases on success)
        }
        this.writer = null;
      }
      // The reader is owned by the worker; the bridge has already detached
      // the worker before getting here, so port.readable should be unlocked
      // and port.close() can proceed.
      await this.port.close();
    } finally {
      this.readableTap = null;
      this.setState({ kind: "closed" });
    }
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error("Transport not open");
    await this.writer.write(bytes);
  }

  async setSignals(signals: SerialSignals): Promise<void> {
    await this.port.setSignals({
      dataTerminalReady: signals.dtr,
      requestToSend: signals.rts,
      break: signals.brk,
    });
  }

  addEventListener(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(s: TransportState): void {
    this._state = s;
    this.emit({ type: "state", state: s });
  }

  private emit(event: TransportEvent): void {
    for (const l of this.listeners) l(event);
  }
}
