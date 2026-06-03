import {
  FrameType,
  decodeFrame,
  encodeData,
  encodeOpen,
  encodeClose,
  encodeSignals,
  encodePing,
} from "@emdzej/stm-tunnel-protocol";
import type {
  SerialConfig,
  SerialSignals,
  SerialTransport,
  TransportEvent,
  TransportState,
} from "./types.js";

export interface WebSocketTransportOptions {
  url: string;
  token?: string;
}

export class WebSocketTransport implements SerialTransport {
  private _state: TransportState = { kind: "closed" };
  private listeners = new Set<(e: TransportEvent) => void>();
  private ws: WebSocket | null = null;
  private streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private _readable: ReadableStream<Uint8Array> | null = null;
  private opts: WebSocketTransportOptions;
  private openResolvers: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private pendingConfig: SerialConfig | null = null;

  constructor(opts: WebSocketTransportOptions) {
    this.opts = opts;
  }

  get state(): TransportState {
    return this._state;
  }

  get readable(): ReadableStream<Uint8Array> {
    if (!this._readable) throw new Error("Transport is not open");
    return this._readable;
  }

  open(config: SerialConfig): Promise<void> {
    this.setState({ kind: "opening" });
    this.resetStream();
    this.pendingConfig = config;
    const url = new URL(this.opts.url);
    if (this.opts.token) url.searchParams.set("token", this.opts.token);
    const ws = new WebSocket(url.toString());
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      this.openResolvers = { resolve, reject };
      ws.addEventListener("open", () => {
        ws.send(encodeOpen(config));
      });
      ws.addEventListener("message", (ev) => this.onMessage(ev));
      ws.addEventListener("error", () => this.fail("websocket error"));
      ws.addEventListener("close", () => {
        if (this._state.kind !== "closed") this.setState({ kind: "closed" });
        this.closeStream();
      });
    });
  }

  async close(): Promise<void> {
    this.setState({ kind: "closing" });
    try {
      this.ws?.send(encodeClose());
    } catch {
      // ignore — WS may already be closing
    }
    this.ws?.close();
    this.ws = null;
    this.closeStream();
    this.setState({ kind: "closed" });
  }

  /** Send CLOSE + OPEN(newConfig) over the existing WebSocket so the remote
   * serial port is reopened with new params without reconnecting / re-authing. */
  async reconfigure(config: SerialConfig): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Transport not open");
    }
    // Old stream is owned by the (now-detached) old worker; cut it now so the
    // old reader sees done, and start a fresh stream for the new attachment.
    this.resetStream();
    this.pendingConfig = config;
    this.setState({ kind: "opening" });
    return new Promise<void>((resolve, reject) => {
      this.openResolvers = { resolve, reject };
      ws.send(encodeClose());
      ws.send(encodeOpen(config));
    });
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Transport not open");
    }
    this.ws.send(encodeData(bytes));
  }

  async setSignals(signals: SerialSignals): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Transport not open");
    }
    this.ws.send(encodeSignals(signals));
  }

  addEventListener(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ping(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodePing());
  }

  private onMessage(ev: MessageEvent): void {
    if (!(ev.data instanceof ArrayBuffer)) return;
    const frame = decodeFrame(new Uint8Array(ev.data));
    switch (frame.type) {
      case FrameType.DATA:
        try {
          this.streamController?.enqueue(frame.payload);
        } catch {
          // controller closed mid-flight (reconfigure race) — drop the byte.
        }
        break;
      case FrameType.STATE:
        // During (re)open we wait for STATE(open=true). The intermediate
        // STATE(open=false) sent by the server in response to our CLOSE is
        // expected during reconfigure — ignore it.
        if (this._state.kind === "opening" && frame.open && this.pendingConfig) {
          const config = this.pendingConfig;
          this.pendingConfig = null;
          this.setState({ kind: "open", config });
          this.openResolvers?.resolve();
          this.openResolvers = null;
        }
        break;
      case FrameType.SIGNALS: {
        const signals: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(frame.signals)) {
          if (typeof v === "boolean") signals[k] = v;
        }
        this.emit({ type: "signals", signals });
        break;
      }
      case FrameType.ERROR:
        this.fail(frame.message);
        break;
      case FrameType.PING:
        break;
    }
  }

  private resetStream(): void {
    this.closeStream();
    this._readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streamController = controller;
      },
    });
  }

  private closeStream(): void {
    try {
      this.streamController?.close();
    } catch {
      // already closed
    }
    this.streamController = null;
    this._readable = null;
  }

  private fail(message: string): void {
    this.setState({ kind: "error", message });
    this.emit({ type: "error", message });
    if (this.openResolvers) {
      this.openResolvers.reject(new Error(message));
      this.openResolvers = null;
    }
  }

  private setState(s: TransportState): void {
    this._state = s;
    this.emit({ type: "state", state: s });
  }

  private emit(event: TransportEvent): void {
    for (const l of this.listeners) l(event);
  }
}
