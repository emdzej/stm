// OPFS-backed session log + IDB index. To be implemented.
export interface SessionMeta {
  id: string;
  startedAt: number;
  endedAt?: number;
  label?: string;
  byteCount: number;
}
