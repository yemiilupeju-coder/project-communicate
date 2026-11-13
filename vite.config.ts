import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Served from "/" (communicate.giftedtech.org on Cloudflare, and locally).
// The GitHub Pages test copy sets BASE_PATH=/<repo-name>/ in pages.yml.
const base = process.env.BASE_PATH || "/";

// Third-party hosts the voice engines download from on first use. They are
// cached so a device that has rendered once can render again offline.
const MODEL_HOSTS = [
  "huggingface.co",
  "cas-bridge.xethub.hf.co",
  "cdn-lfs.hf.co",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
];

export default defineConfig({
  base,
  define: {
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Communicate",
        short_name: "Communicate",
        description: "A communication board that works in any modern browser, online or offline.",
        display: "standalone",
        orientation: "any",
        lang: "en-CA",
        background_color: "#ffffff",
        theme_color: "#1f4f8b",
        start_url: base,
        scope: base,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,wasm,png,svg,json}"],
        // The voice-engine runtimes (~36 MB) are NOT precached: a device running
        // only the storage spike shouldn't download them. They are cached on
        // first use instead (VOICE_RUNTIME rule below).
        globIgnores: ["**/ort-*.wasm", "**/ort.*.js", "**/kokoro-*.js", "**/piper-*.js"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Multi-page app: each page is precached; no single-page fallback.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && /\/assets\/(ort[-.]|kokoro-|piper-)/.test(url.pathname),
            handler: "CacheFirst" as const,
            options: {
              cacheName: "voice-runtime",
              cacheableResponse: { statuses: [200] },
            },
          },
          ...MODEL_HOSTS.map((host) => ({
            urlPattern: ({ url }: { url: URL }) => url.hostname === host,
            handler: "CacheFirst" as const,
            options: {
              cacheName: `models-${host}`,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200 },
            },
          })),
        ],
      },
    }),
  ],
  optimizeDeps: {
    // sqlite-wasm loads its own .wasm relative to its module; pre-bundling breaks that.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        app: page("./index.html"),
        demo: page("./demo/index.html"),
        hub: page("./spikes/index.html"),
        storage: page("./spikes/storage/index.html"),
        voice: page("./spikes/voice/index.html"),
      },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
