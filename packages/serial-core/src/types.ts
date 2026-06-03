export interface SerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware";
}

export interface SerialSignals {
  dtr?: boolean;
  rts?: boolean;
  brk?: boolean;
}

export type TransportState =
  | { kind: "closed" }
  | { kind: "opening" }
  | { kind: "open"; config: SerialConfig }
  | { kind: "closing" }
  | { kind: "error"; message: string };

export type TransportEvent =
  | { type: "state"; state: TransportState }
  | { type: "signals"; signals: Readonly<Record<string, boolean>> }
  | { type: "error"; message: string };

export interface SerialTransport {
  readonly state: TransportState;
  readonly readable: ReadableStream<Uint8Array>;
  open(config: SerialConfig): Promise<void>;
  close(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  setSignals(signals: SerialSignals): Promise<void>;
  addEventListener(listener: (event: TransportEvent) => void): () => void;
  /** Apply a new config without tearing down the underlying connection.
   * Optional — bridge falls back to close() + open() if not implemented. */
  reconfigure?(config: SerialConfig): Promise<void>;
}
