import { useCallback, useEffect, useRef, useState } from "react";
import { makeBackup, restoreBackup, BackupError } from "../core/backup";
import { afterFailure, checkPin, hashPin, isLocked, LOCK_KEY, NO_LOCK, PIN_KEY } from "../core/pin";
import type { LockState, PinRecord } from "../core/pin";
import {
  canAddStudent,
  importPublicKey,
  isLicensed,
  LICENCE_KEY,
  LicenceError,
  licenceStatus,
  normaliseCode,
  CODE_PATTERN,
  verifyLicence,
  type LicencePayload,
  type SignedLicence,
} from "../core/licence";
import { LICENCE_PUBLIC_KEY, LICENCE_SERVICE } from "../core/licenceKey";
import { newProfile, type Profile } from "../core/profile";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "../core/settings";
import { MemoryStore, openStore, type AppStore } from "../core/store";
import { demoProfile } from "./demoData";

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
  licence: LicencePayload | null;
}

// Boot once per page, even when React mounts effects twice in development.
let bootPromise: Promise<Boot> | null = null;

let keyPromise: Promise<CryptoKey | null> | null = null;
function publicKey(): Promise<CryptoKey | null> {
  keyPromise ??= LICENCE_PUBLIC_KEY
    ? importPublicKey(LICENCE_PUBLIC_KEY).catch(() => null)
    : Promise.resolve(null);
  return keyPromise;
}

async function loadLicence(store: AppStore): Promise<LicencePayload | null> {
  const file = await store.getMeta<SignedLicence>(LICENCE_KEY).catch(() => null);
  const key = await publicKey();
  if (!file || !key) return null;
  return verifyLicence(file, key).catch(() => null);
}

async function bootDemo(): Promise<Boot> {
  const store = new MemoryStore();
  const alex = demoProfile();
  await store.saveProfile(alex);
  return { store, profiles: [alex], activeId: alex.id, pin: null, lock: NO_LOCK, licence: null };
}

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
  const licence = await loadLicence(store);
  const first = profiles[0] as Profile;
  return {
    store,
    profiles,
    activeId: profiles.some((p) => p.id === active) ? (active as string) : first.id,
    pin,
    lock,
    licence,
  };
}

/** A profile nobody has set up yet (safe to replace with a restored backup). */
const isPristine = (p: Profile) =>
  p.name === "Student" && p.added.length === 0 && p.saved.length === 0 && p.hidden.length === 0;

/**
 * Students, their words and the adult PIN. Until storage has opened, the app
 * runs on the built-in boards and last-saved settings, so a slow or broken
 * store never stops a student from talking.
 */
export function useStudentData({ demo = false }: { demo?: boolean } = {}) {
  const [store, setStore] = useState<AppStore | null>(null);
  const [licence, setLicence] = useState<LicencePayload | null>(null);
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
    bootPromise ??= demo ? bootDemo() : boot();
    void bootPromise.then((b) => {
      if (!alive) return;
      setStore(b.store);
      setProfiles(b.profiles);
      setActiveId(b.activeId);
      setPin(b.pin);
      setLock(b.lock);
      setLicence(b.licence);
    });
    return () => {
      alive = false;
    };
  }, []);

  const profile = profiles.find((p) => p.id === activeId) ?? null;
  const profileIndex = profile ? profiles.findIndex((p) => p.id === profile.id) : 0;
  const status = licenceStatus(licence, Date.now(), demo);
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
      if (!demo) saveSettings(safeStorage(), next);
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
      if (next && !demo) saveSettings(safeStorage(), next.settings);
    },
    [store, profiles, demo],
  );

  const addProfile = useCallback(
    (name: string): string | null => {
      if (!canAddStudent(status, profiles.length)) {
        return "More than one student on a device needs a school or district licence.";
      }
      const created = newProfile(name, DEFAULT_SETTINGS);
      setProfiles((list) => [...list, created]);
      persist(created);
      switchTo(created.id);
      return null;
    },
    [persist, switchTo, status, profiles.length],
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
      // Family: one student. A restore may replace an untouched starter profile.
      const replace =
        !isLicensed(status) && profiles.length === 1 && isPristine(profiles[0] as Profile);
      if (!isLicensed(status) && profiles.length >= 1 && !replace) {
        return "Restoring another student onto this device needs a school or district licence.";
      }
      try {
        const restored = await restoreBackup(store, file);
        if (replace && profiles[0]) {
          const old = profiles[0];
          await store.deleteProfile(old.id).catch(() => undefined);
          setProfiles([restored]);
        } else {
          setProfiles((list) => [...list, restored]);
        }
        switchTo(restored.id);
        return `Restored ${restored.name} as a new student on this device.`;
      } catch (error) {
        return error instanceof BackupError ? error.message : "The backup couldn't be restored.";
      }
    },
    [store, switchTo, status, profiles],
  );

  // ── Licence ──
  const keyReady = LICENCE_PUBLIC_KEY !== null;

  const install = useCallback(
    async (file: unknown, expectCode?: string): Promise<string> => {
      const key = await publicKey();
      if (!store || !key) return "Licences aren't set up in this version yet.";
      try {
        const payload = await verifyLicence(file, key);
        if (expectCode && payload.code !== expectCode)
          return "That licence doesn't match the code.";
        await store.setMeta(LICENCE_KEY, file);
        setLicence(payload);
        return `Licensed to ${payload.customer} until ${payload.ends}.`;
      } catch (error) {
        return error instanceof LicenceError ? error.message : "That licence couldn't be checked.";
      }
    },
    [store],
  );

  const activateCode = useCallback(
    async (input: string): Promise<string> => {
      const code = normaliseCode(input);
      if (!CODE_PATTERN.test(code)) return "A licence code looks like GT-7KQ4-M2XD.";
      if (!keyReady) return "Licences aren't set up in this version yet.";
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(`${LICENCE_SERVICE}${code}`, { signal: controller.signal });
        if (response.status === 404) return "That code wasn't found. Check it and try again.";
        if (!response.ok) return "The licence service didn't answer. Try again later.";
        return await install(await response.json(), code);
      } catch {
        return "Connect to the internet once to activate. After that, no internet is needed.";
      } finally {
        window.clearTimeout(timer);
      }
    },
    [install, keyReady],
  );

  const importLicenceFile = useCallback(
    async (file: File): Promise<string> => {
      if (file.size > 16_384) return "That file is too large to be a licence.";
      try {
        return await install(JSON.parse(await file.text()));
      } catch {
        return "That file isn't a GiftedTech licence.";
      }
    },
    [install],
  );

  const removeLicence = useCallback(async () => {
    setLicence(null);
    await store?.setMeta(LICENCE_KEY, null).catch(() => undefined);
  }, [store]);

  // Device management can open the app with ?licence=GT-XXXX-XXXX to activate it.
  const urlCodeTried = useRef(false);
  useEffect(() => {
    if (demo || !store || urlCodeTried.current) return;
    urlCodeTried.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("licence");
    if (!code) return;
    void activateCode(code).finally(() => {
      params.delete("licence");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    });
  }, [demo, store, activateCode]);

  return {
    demo,
    status,
    profileIndex,
    keyReady,
    activateCode,
    importLicenceFile,
    removeLicence,
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
