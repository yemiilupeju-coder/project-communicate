/**
 * On-device storage for profiles, photos and adult settings (Release 2).
 *
 * Interim adapter: IndexedDB, which every target browser supports and which
 * keeps working in Safari Home Screen apps. ADR 0003's SQLite-in-OPFS store
 * replaces it behind this same interface once the Phase 0 storage spike has
 * passed on real devices (ADR 0008).
 *
 * If IndexedDB can't be opened (some private-browsing modes), the app uses
 * an in-memory store and says so in the adult menu. The built-in boards
 * never depend on storage, so the student can always talk.
 */

import { parseProfile, type Profile } from "./profile";

export interface AppStore {
  readonly durable: boolean;
  listProfiles(): Promise<Profile[]>;
  saveProfile(profile: Profile): Promise<void>;
  /** Deletes a profile and its photos. */
  deleteProfile(id: string): Promise<void>;
  getMedia(id: string): Promise<Blob | null>;
  putMedia(id: string, owner: string, blob: Blob): Promise<void>;
  deleteMedia(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | null>;
  setMeta(key: string, value: unknown): Promise<void>;
}

interface MediaRecord {
  id: string;
  owner: string;
  blob: Blob;
}

const DB_NAME = "communicate";
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IndexedDbStore implements AppStore {
  readonly durable = true;
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<IndexedDbStore> {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Version 1. Later versions add stores here; they never drop data.
      if (!db.objectStoreNames.contains("profiles"))
        db.createObjectStore("profiles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "id" }).createIndex("owner", "owner");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    const db = await request(req);
    return new IndexedDbStore(db);
  }

  async listProfiles(): Promise<Profile[]> {
    const tx = this.db.transaction("profiles", "readonly");
    const rows = await request(tx.objectStore("profiles").getAll());
    return rows
      .map((row) => parseProfile(row))
      .filter((p): p is Profile => p !== null)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async saveProfile(profile: Profile): Promise<void> {
    const tx = this.db.transaction("profiles", "readwrite");
    tx.objectStore("profiles").put(profile);
    await done(tx);
  }

  async deleteProfile(id: string): Promise<void> {
    const tx = this.db.transaction(["profiles", "media"], "readwrite");
    tx.objectStore("profiles").delete(id);
    const media = tx.objectStore("media");
    const keys = await request(media.index("owner").getAllKeys(id));
    for (const key of keys) media.delete(key);
    await done(tx);
  }

  async getMedia(id: string): Promise<Blob | null> {
    const tx = this.db.transaction("media", "readonly");
    const row = (await request(tx.objectStore("media").get(id))) as MediaRecord | undefined;
    return row?.blob ?? null;
  }

  async putMedia(id: string, owner: string, blob: Blob): Promise<void> {
    const tx = this.db.transaction("media", "readwrite");
    tx.objectStore("media").put({ id, owner, blob } satisfies MediaRecord);
    await done(tx);
  }

  async deleteMedia(id: string): Promise<void> {
    const tx = this.db.transaction("media", "readwrite");
    tx.objectStore("media").delete(id);
    await done(tx);
  }

  async getMeta<T>(key: string): Promise<T | null> {
    const tx = this.db.transaction("meta", "readonly");
    const value = (await request(tx.objectStore("meta").get(key))) as T | undefined;
    return value ?? null;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction("meta", "readwrite");
    tx.objectStore("meta").put(value, key);
    await done(tx);
  }
}

/** Used when IndexedDB is unavailable, and in tests. Nothing survives a reload. */
export class MemoryStore implements AppStore {
  readonly durable = false;
  private profiles = new Map<string, Profile>();
  private media = new Map<string, MediaRecord>();
  private meta = new Map<string, unknown>();

  async listProfiles(): Promise<Profile[]> {
    return [...this.profiles.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  async saveProfile(profile: Profile): Promise<void> {
    this.profiles.set(profile.id, structuredClone(profile));
  }
  async deleteProfile(id: string): Promise<void> {
    this.profiles.delete(id);
    for (const [key, row] of this.media) if (row.owner === id) this.media.delete(key);
  }
  async getMedia(id: string): Promise<Blob | null> {
    return this.media.get(id)?.blob ?? null;
  }
  async putMedia(id: string, owner: string, blob: Blob): Promise<void> {
    this.media.set(id, { id, owner, blob });
  }
  async deleteMedia(id: string): Promise<void> {
    this.media.delete(id);
  }
  async getMeta<T>(key: string): Promise<T | null> {
    return (this.meta.get(key) as T | undefined) ?? null;
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, structuredClone(value));
  }
}

export async function openStore(): Promise<AppStore> {
  try {
    if (typeof indexedDB === "undefined") return new MemoryStore();
    return await IndexedDbStore.open();
  } catch {
    return new MemoryStore();
  }
}
