/**
 * Worker message protocol.
 *
 * Architecture: the main thread owns the SerialTransport (WebSerial SerialPort
 * instances can't be transferred to a worker, and the open() call requires a
 * user-gesture context). ReadableStream<Uint8Array> *is* transferable, so the
 * main thread transfers the transport's readable to the worker, the worker
 * reads + batches + posts back, and writes go directly through the main-thread
 * writer (low frequency, no benefit to a round-trip).
 */

/** Main → Worker. */
export type WorkerInbound =
  | { kind: "attach"; readable: ReadableStream<Uint8Array> }
  | { kind: "detach" };

/** Worker → Main. */
export type WorkerOutbound =
  | { kind: "data"; bytes: Uint8Array }
  | { kind: "error"; message: string }
  | { kind: "metrics"; rxBytes: number; rxRate: number }
  | { kind: "detached" };
