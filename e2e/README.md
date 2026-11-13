# Browser smoke tests

Headless Chrome checks of the built site, run by hand (not yet in CI).

1. `BASE_PATH=/project-communicate/ npm run build`
2. `BASE_PATH=/project-communicate/ npx vite preview --port 4173`
3. In another terminal: `npm i -D playwright-core`, then `node e2e/release1-smoke.mjs` and
   `node e2e/release2-smoke.mjs`. Edit `executablePath` in each file to point at your Chrome.

Headless browsers have no voices, so speech is never verified here; the large-text fallback is.

`licence-demo-smoke.mjs` needs a local licence service and a test key:

1. In `giftedtech-licence`: `HOME=/tmp/lh node scripts/keygen.mjs`, then
   `HOME=/tmp/lh node scripts/issue.mjs --customer "Maple Elementary (test)" --tier pilot --seats 10 --ends 2027-03-31`,
   `npx wrangler kv key put --binding LICENCES --local <code> --path <file>`, `npx wrangler dev --port 8787 --local`.
2. Build Communicate with `VITE_LICENCE_PUBLIC_KEY="$(cat /tmp/lh/giftedtech-licensing/giftedtech-licence-public-key.json)"`
   and `VITE_LICENCE_SERVICE=http://localhost:8787/v1/licences/`, preview on port 4173.
3. `node e2e/licence-demo-smoke.mjs <code>`.
