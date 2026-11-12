/**
 * Rendered clips are stored in IndexedDB as Blobs. IndexedDB Blob storage is
 * supported by every target browser, including older Safari versions that
 * can't write OPFS files from the main thread.
 */

export interface StoredClip {
  key: string;
  engine: string;
  voice: string;
  index: number;
  text: string;
  blob: Blob;
  renderMs: number;
  createdAt: string;
}

const DB_NAME = "communicate-voice-spike";
const STORE = "clips";

export function clipKey(engine: string, voice: string, index: number): string {
  return `${engine}:${voice}:${index}`;
}

export function clipPrefix(engine: string, voice: string): string {
  return `${engine}:${voice}:`;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open clip store"));
  });
}

function prefixRange(prefix: string): IDBKeyRange {
  // "￿" sorts after every character used in our keys.
  return IDBKeyRange.bound(prefix, `${prefix}￿`);
}

export async function putClip(clip: StoredClip): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(clip);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save clip"));
      tx.onabort = () => reject(tx.error ?? new Error("Saving clip was aborted (storage full?)"));
    });
  } finally {
    db.close();
  }
}

export async function listClips(prefix: string): Promise<StoredClip[]> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .getAll(prefixRange(prefix));
      request.onsuccess = () => resolve(request.result as StoredClip[]);
      request.onerror = () => reject(request.error ?? new Error("Could not read clips"));
    });
  } finally {
    db.close();
  }
}

export async function deleteClips(prefix: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(prefixRange(prefix));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not delete clips"));
    });
  } finally {
    db.close();
  }
}
