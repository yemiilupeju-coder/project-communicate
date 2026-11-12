import { useCallback, useEffect, useRef, useState } from "react";
import { makeBackup, restoreBackup, BackupError } from "../core/backup";
import { afterFailure, checkPin, hashPin, isLocked, LOCK_KEY, NO_LOCK, PIN_KEY } from "../core/pin";
import type { LockState, PinRecord } from "../core/pin";
import { newProfile, type Profile } from "../core/profile";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "../core/settings";
import { openStore, type AppStore } from "../core/store";

const ACTIVE_KEY = "activeProfile";

export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface Boot {
  store: AppStore;
  profiles: Profile[];
  activeId: string;
  pin: PinRecord | null;
  lock: LockState;
}

// Boot once per page, even when React mounts effects twice in development.
let bootPromise: Promise<Boot> | null = null;

async function boot(): Promise<Boot> {
  const store = await openStore();
  let profiles = await store.listProfiles().catch(() => [] as Profile[]);
  if (profiles.length === 0) {
    // First run (or Release 1 upgrade): one profile, keeping any saved settings.
    const first = newProfile("Student", loadSettings(safeStorage()));
    await store.saveProfile(first).catch(() => undefined);
    profiles = [first];
  }
  const active = await store.getMeta<string>(ACTIVE_KEY).catch(() => null);
  const pin = await store.getMeta<PinRecord>(PIN_KEY).catch(() => null);
  const lock = (await store.getMeta<LockState>(LOCK_KEY).catch(() => null)) ?? NO_LOCK;
  const first = profiles[0] as Profile;
  return {
    store,
    profiles,
    activeId: profiles.some((p) => p.id === active) ? (active as string) : first.id,
    pin,
    lock,
  };
}

/**
 * Students, their words and the adult PIN. Until storage has opened, the app
 * runs on the built-in boards and last-saved settings, so a slow or broken
 * store never stops a student from talking.
 */
export function useStudentData() {
  const [store, setStore] = useState<AppStore | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pin, setPin] = useState<PinRecord | null>(null);
  const [lock, setLock] = useState<LockState>(NO_LOCK);
  const [saved, setSaved] = useState(true);
  const [fallbackSettings, setFallbackSettings] = useState<Settings>(() =>
    loadSettings(safeStorage()),
  );
  const pending = useRef(Promise.resolve());

  useEffect(() => {
    let alive = true;
    bootPromise ??= boot();
    void bootPromise.then((b) => {
      if (!alive) return;
      setStore(b.store);
      setProfiles(b.profiles);
      setActiveId(b.activeId);
      setPin(b.pin);
      setLock(b.lock);
    });
    return () => {
      alive = false;
    };
  }, []);

  const profile = profiles.find((p) => p.id === activeId) ?? null;
  const settings = profile?.settings ?? fallbackSettings;

  /** Saves in order, so a quick run of edits can't land out of sequence. */
  const persist = useCallback(
    (next: Profile) => {
      if (!store) return;
      pending.current = pending.current
        .then(() => store.saveProfile(next))
        .then(() => setSaved(store.durable))
        .catch(() => setSaved(false));
    },
    [store],
  );

  const updateProfile = useCallback(
    (change: (current: Profile) => Profile) => {
      if (!profile) return;
      const next = change(profile);
      if (next === profile) return;
      setProfiles((list) => list.map((p) => (p.id === next.id ? next : p)));
      persist(next);
    },
    [profile, persist],
  );

  const setSettings = useCallback(
    (next: Settings) => {
      // Mirror to localStorage so the last settings work even if the store fails.
      saveSettings(safeStorage(), next);
      if (profile) updateProfile((p) => ({ ...p, settings: next }));
      else setFallbackSettings(next);
    },
    [profile, updateProfile],
  );

  const switchTo = useCallback(
    (id: string) => {
      setActiveId(id);
      void store?.setMeta(ACTIVE_KEY, id).catch(() => undefined);
      const next = profiles.find((p) => p.id === id);
      if (next) saveSettings(safeStorage(), next.settings);
    },
    [store, profiles],
  );

  const addProfile = useCallback(
    (name: string) => {
      const created = newProfile(name, DEFAULT_SETTINGS);
      setProfiles((list) => [...list, created]);
      persist(created);
      switchTo(created.id);
    },
    [persist, switchTo],
  );

  const removeProfile = useCallback(async () => {
    if (!store || !profile || profiles.length < 2) return;
    await store.deleteProfile(profile.id).catch(() => undefined);
    const rest = profiles.filter((p) => p.id !== profile.id);
    setProfiles(rest);
    if (rest[0]) switchTo(rest[0].id);
  }, [store, profile, profiles, switchTo]);

  // ── PIN ──
  const tryPin = useCallback(
    async (entered: string): Promise<string | null> => {
      if (!pin) return null;
      const now = Date.now();
      if (isLocked(lock, now)) return "The PIN pad is locked for now.";
      if (await checkPin(entered, pin)) {
        setLock(NO_LOCK);
        void store?.setMeta(LOCK_KEY, NO_LOCK).catch(() => undefined);
        return null;
      }
      const next = afterFailure(lock, now);
      setLock(next);
      void store?.setMeta(LOCK_KEY, next).catch(() => undefined);
      return "That PIN isn't right.";
    },
    [pin, lock, store],
  );

  const savePin = useCallback(
    async (entered: string) => {
      const record = await hashPin(entered);
      setPin(record);
      await store?.setMeta(PIN_KEY, record);
    },
    [store],
  );

  const clearPin = useCallback(async () => {
    setPin(null);
    await store?.setMeta(PIN_KEY, null);
  }, [store]);

  // ── Backup ──
  const downloadBackup = useCallback(async (): Promise<string> => {
    if (!store || !profile) return "Storage is still starting. Try again in a moment.";
    try {
      const blob = await makeBackup(store, profile);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `communicate-${profile.name.replace(/[^\w-]+/g, "_")}-${day}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return "Backup downloaded. Keep it somewhere safe and private.";
    } catch {
      return "The backup couldn't be made on this device.";
    }
  }, [store, profile]);

  const restore = useCallback(
    async (file: File): Promise<string> => {
      if (!store) return "Storage is still starting. Try again in a moment.";
      try {
        const restored = await restoreBackup(store, file);
        setProfiles((list) => [...list, restored]);
        switchTo(restored.id);
        return `Restored ${restored.name} as a new student on this device.`;
      } catch (error) {
        return error instanceof BackupError ? error.message : "The backup couldn't be restored.";
      }
    },
    [store, switchTo],
  );

  return {
    store,
    ready: store !== null,
    durable: store?.durable ?? false,
    profiles,
    profile,
    settings,
    saved,
    setSettings,
    updateProfile,
    switchTo,
    addProfile,
    removeProfile,
    pinSet: pin !== null,
    lockedUntil: lock.lockedUntil,
    tryPin,
    savePin,
    clearPin,
    downloadBackup,
    restore,
  };
}
