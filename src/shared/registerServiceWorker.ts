import { registerSW } from "virtual:pwa-register";

/**
 * Registers the service worker so the spikes open offline after one online visit.
 *
 * Updates are never applied automatically: `onNeedRefresh` hands the caller a
 * function to apply the update when it is safe. This mirrors the product rule
 * that an update must never interrupt a conversation (concept 6).
 */
export function registerServiceWorker(onUpdateReady: (apply: () => void) => void): void {
  if (!("serviceWorker" in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      onUpdateReady(() => {
        void updateSW(true);
      });
    },
  });
}
