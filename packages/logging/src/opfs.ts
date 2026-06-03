/** OPFS helpers scoped to a single sessions directory.
 *
 * One file per session at `stm-sessions/<id>.bin`. Writes use a long-lived
 * FileSystemWritableFileStream; the auto-advancing position means subsequent
 * writes append naturally. */

const DIR_NAME = "stm-sessions";

async function getSessionsDir(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create });
}

export async function openSessionWritable(
  id: string,
): Promise<FileSystemWritableFileStream> {
  const dir = await getSessionsDir(true);
  const file = await dir.getFileHandle(`${id}.bin`, { create: true });
  return file.createWritable();
}

export async function readSessionFile(id: string): Promise<File> {
  const dir = await getSessionsDir(false);
  const handle = await dir.getFileHandle(`${id}.bin`);
  return handle.getFile();
}

export async function removeSessionFile(id: string): Promise<void> {
  const dir = await getSessionsDir(false).catch(() => null);
  if (!dir) return;
  await dir.removeEntry(`${id}.bin`).catch(() => {
    // already gone — fine
  });
}

export function isOpfsAvailable(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;
}
