/**
 * Facts about the running browser that the spikes record with every result.
 * Contains no personal information: no names, no location, no identifiers.
 */
export interface EnvironmentSnapshot {
  capturedAt: string;
  userAgent: string;
  standalone: boolean;
  online: boolean;
  screen: { width: number; height: number; pixelRatio: number };
  storage: StorageStatus;
  webgpu: boolean;
}

export interface StorageStatus {
  apiAvailable: boolean;
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

/** True when launched from the Home Screen / installed, not in a browser tab. */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export async function readStorageStatus(): Promise<StorageStatus> {
  const storage = navigator.storage as StorageManager | undefined;
  if (!storage) {
    return { apiAvailable: false, persisted: null, usageBytes: null, quotaBytes: null };
  }
  const persisted = typeof storage.persisted === "function" ? await storage.persisted() : null;
  const estimate = typeof storage.estimate === "function" ? await storage.estimate() : undefined;
  return {
    apiAvailable: true,
    persisted,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  };
}

/** Asks the browser to mark this origin's storage as persistent. */
export async function requestPersistence(): Promise<boolean | null> {
  const storage = navigator.storage as StorageManager | undefined;
  if (!storage || typeof storage.persist !== "function") return null;
  return storage.persist();
}

export async function captureEnvironment(): Promise<EnvironmentSnapshot> {
  return {
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    online: navigator.onLine,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio,
    },
    storage: await readStorageStatus(),
    webgpu: "gpu" in navigator,
  };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
