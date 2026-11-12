/**
 * Backup files (Release 2): one student's profile, words and photos in a
 * single JSON file an adult downloads and keeps safe. Until encrypted sync
 * (Phase 4) exists, this is how a cleared or replaced device gets a student's
 * personal words back. Restoring always creates a new profile; it never
 * overwrites one.
 */

import { newId, parseProfile, type Profile } from "./profile";
import type { AppStore } from "./store";

export const BACKUP_FORMAT = "communicate-backup";
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface BackupPhoto {
  id: string;
  type: string;
  data: string; // base64
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  profile: Profile;
  photos: BackupPhoto[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function base64ToBlob(data: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

export async function makeBackup(store: AppStore, profile: Profile): Promise<Blob> {
  const photos: BackupPhoto[] = [];
  for (const word of profile.added) {
    if (!word.photoId) continue;
    const blob = await store.getMedia(word.photoId);
    if (blob) photos.push({ id: word.photoId, type: blob.type, data: await blobToBase64(blob) });
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    photos,
  };
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

export class BackupError extends Error {}

/** Validates a backup file and restores it as a new profile with fresh ids. */
export async function restoreBackup(store: AppStore, file: Blob): Promise<Profile> {
  if (file.size > MAX_BACKUP_BYTES) throw new BackupError("This file is too large to be a backup.");
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new BackupError("This file isn't a Communicate backup.");
  }
  const record = raw as Partial<BackupFile> | null;
  if (!record || record.format !== BACKUP_FORMAT || record.version !== 1) {
    throw new BackupError("This file isn't a Communicate backup.");
  }
  const parsed = parseProfile(record.profile);
  if (!parsed) throw new BackupError("The backup is damaged and can't be restored.");

  const profileId = newId("p");
  const photoIds = new Map<string, string>();
  for (const photo of Array.isArray(record.photos) ? record.photos : []) {
    if (typeof photo?.id !== "string" || typeof photo.data !== "string") continue;
    if (!PHOTO_TYPES.has(photo.type)) continue;
    if (photo.data.length > (MAX_PHOTO_BYTES * 4) / 3 + 4) continue;
    let blob: Blob;
    try {
      blob = base64ToBlob(photo.data, photo.type);
    } catch {
      continue;
    }
    const id = newId("ph");
    await store.putMedia(id, profileId, blob);
    photoIds.set(photo.id, id);
  }

  const restored: Profile = {
    ...parsed,
    id: profileId,
    createdAt: Date.now(),
    added: parsed.added.map((w) => {
      const { photoId, ...rest } = w;
      const mapped = photoId ? photoIds.get(photoId) : undefined;
      return { ...rest, id: newId("w"), ...(mapped ? { photoId: mapped } : {}) };
    }),
  };
  await store.saveProfile(restored);
  return restored;
}
