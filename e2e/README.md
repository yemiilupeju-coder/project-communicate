# Browser smoke tests

Headless Chrome checks of the built site, run by hand (not yet in CI).

1. `BASE_PATH=/project-communicate/ npm run build`
2. `BASE_PATH=/project-communicate/ npx vite preview --port 4173`
3. In another terminal: `npm i -D playwright-core`, then `node e2e/release1-smoke.mjs` and
   `node e2e/release2-smoke.mjs`. Edit `executablePath` in each file to point at your Chrome.

Headless browsers have no voices, so speech is never verified here; the large-text fallback is.
