import { openDb, put, getAll, del, get } from "./idb.js";
import {
  isOpfsAvailable,
  openSessionWritable,
  readSessionFile,
  removeSessionFile,
} from "./opfs.js";

const DB_NAME = "stm-logs";
const STORE = "sessions";
const DB_VERSION = 1;

export interface SessionMeta {
  id: string;
  /** Epoch milliseconds. */
  startedAt: number;
  endedAt?: number;
  /** User label, editable. */
  label?: string;
  /** Bytes captured so far (running counter; persisted on stop). */
  byteCount: number;
  /** Snapshot of the active serial config when the session started. */
  config?: {
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
    flowControl: string;
  };
  transport?: "web-serial" | "tunnel";
}

export interface StartSessionInput {
  config?: SessionMeta["config"];
  transport?: SessionMeta["transport"];
  label?: string;
}

/** Append-only per-session log: bytes go to OPFS, metadata goes to IDB.
 *
 * State machine is intentionally simple — at most one active session per
 * service instance. Callers decide when to start / stop. The wire-up to the
 * SerialBridge lives at the app layer. */
export class LoggingService {
  private db: IDBDatabase | null = null;
  private writable: FileSystemWritableFileStream | null = null;
  private active: SessionMeta | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  /** Idempotent — open the IDB once. */
  async open(): Promise<void> {
    if (this.db) return;
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available");
    }
    this.db = await openDb(DB_NAME, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    });
  }

  get currentSession(): SessionMeta | null {
    return this.active;
  }

  isAvailable(): boolean {
    return isOpfsAvailable() && typeof indexedDB !== "undefined";
  }

  async start(input: StartSessionInput): Promise<SessionMeta> {
    if (this.active) return this.active;
    await this.open();
    const id = makeId();
    const meta: SessionMeta = {
      id,
      startedAt: Date.now(),
      byteCount: 0,
      label: input.label,
      config: input.config,
      transport: input.transport,
    };
    this.writable = await openSessionWritable(id);
    this.active = meta;
    await put(this.db!, STORE, meta);
    return meta;
  }

  /** Queue a write. Returns immediately — failures are propagated through
   * the internal write chain and surfaced on `stop()`. */
  append(bytes: Uint8Array): void {
    if (!this.writable || !this.active) return;
    const w = this.writable;
    const meta = this.active;
    // Snapshot a copy: ReadableStreams may reuse the underlying buffer.
    const copy = new Uint8Array(bytes);
    this.writeChain = this.writeChain.then(() => w.write(copy));
    meta.byteCount += copy.byteLength;
  }

  async stop(): Promise<SessionMeta | null> {
    if (!this.active) return null;
    const meta = this.active;
    try {
      await this.writeChain;
      await this.writable?.close();
    } catch (err) {
      // Persist what we have anyway; the file may still be partially usable.
      // eslint-disable-next-line no-console
      console.error("[STM] log flush failed:", err);
    }
    this.writable = null;
    this.writeChain = Promise.resolve();
    meta.endedAt = Date.now();
    await put(this.db!, STORE, meta);
    this.active = null;
    return meta;
  }

  async list(): Promise<SessionMeta[]> {
    await this.open();
    const all = await getAll<SessionMeta>(this.db!, STORE);
    return all.sort((a, b) => b.startedAt - a.startedAt);
  }

  async getOne(id: string): Promise<SessionMeta | undefined> {
    await this.open();
    return get<SessionMeta>(this.db!, STORE, id);
  }

  async setLabel(id: string, label: string): Promise<void> {
    await this.open();
    const meta = await get<SessionMeta>(this.db!, STORE, id);
    if (!meta) return;
    meta.label = label || undefined;
    await put(this.db!, STORE, meta);
  }

  async exportBlob(id: string): Promise<Blob> {
    return readSessionFile(id);
  }

  async deleteOne(id: string): Promise<void> {
    if (this.active?.id === id) {
      throw new Error("Cannot delete the currently-active session");
    }
    await this.open();
    await del(this.db!, STORE, id);
    await removeSessionFile(id);
  }
}

function makeId(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${iso}-${nonce}`;
}
