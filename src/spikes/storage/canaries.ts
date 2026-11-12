/**
 * Canaries: one small value in each of the other browser storage types, so the
 * report shows whether the browser cleared everything or only some of it.
 */

export interface CanaryState {
  localStorage: string | null;
  indexedDb: string | null;
  cacheStorage: string | null;
}

const KEY = "communicate-spike-canary";
const DB_NAME = "communicate-spike-canary";
const STORE = "canary";
const CACHE = "communicate-spike-canary";
const CACHE_URL = "./__canary__";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function idbGet(): Promise<string | null> {
  const db = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
  } finally {
    db.close();
  }
}

async function idbSet(value: string): Promise<void> {
  const db = await idbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
  } finally {
    db.close();
  }
}

async function cacheGet(): Promise<string | null> {
  if (!("caches" in self)) return null;
  const response = await (await caches.open(CACHE)).match(CACHE_URL);
  return response ? response.text() : null;
}

async function cacheSet(value: string): Promise<void> {
  if (!("caches" in self)) return;
  await (await caches.open(CACHE)).put(CACHE_URL, new Response(value));
}

/** Reads what survived from earlier launches, then plants this launch's value. */
export async function readThenPlantCanaries(value: string): Promise<CanaryState> {
  const before: CanaryState = {
    localStorage: localStorage.getItem(KEY),
    indexedDb: await idbGet().catch(() => null),
    cacheStorage: await cacheGet().catch(() => null),
  };
  // Only plant the first value: we want to know if the ORIGINAL survived.
  if (before.localStorage === null) localStorage.setItem(KEY, value);
  if (before.indexedDb === null) await idbSet(value).catch(() => undefined);
  if (before.cacheStorage === null) await cacheSet(value).catch(() => undefined);
  return before;
}

export function clearCanaries(): Promise<void> {
  localStorage.removeItem(KEY);
  const deletions: Array<Promise<unknown>> = [
    new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    }),
  ];
  if ("caches" in self) deletions.push(caches.delete(CACHE));
  return Promise.all(deletions).then(() => undefined);
}
