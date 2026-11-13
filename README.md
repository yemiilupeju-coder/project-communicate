# Project Communicate

Offline-first AAC (augmentative and alternative communication) platform, built web-first as a
Progressive Web App for iPads, Android tablets and Chromebooks.

It runs in any modern browser (Safari, Chrome, Edge, Firefox) on any tablet, Chromebook or
computer, and keeps working offline after the first visit. No app store, no particular device.

**Release 1 — the student communicator** is at the site root:

- a home board of the 36 Universal Core words that never move, with room to grow;
- a full keyboard one tap away;
- a "My voice" strip: no, yes, stop that, I don't like that, wait I'm talking, help me, I need a break;
- speech for each word and the whole message, using the device's voices, with large text if speech
  can't play;
- modeling mode for adults, and an adult menu (hold the **Adults** button for 3 seconds) for voice,
  speed, symbols, high contrast, keyboard layout and device readiness.

**Release 2 — vocabulary for school, home and growth:**

- twelve topic pages chosen from AAC research (People, Feelings, My body, Food & drink, Places,
  School, Play, Actions, Describe, Where & when, Little words, Chat), about 400 more words, every
  one in a fixed place;
- **My body** one tap away on every page: hurt, sick, bathroom, pain, body parts and safety words;
- **Endings**: other forms of the last word (go → goes, going, went, gone);
- **My sentences**: save a message to say again, and a list of what was said today;
- **students**: each has their own name, voice, settings and words;
- **Edit words**: adults add words (with a symbol or photo) in empty places, or hide words —
  nothing ever moves;
- an optional **adult PIN**, and **backup files** to move a student's words to another device.

**Licensing and demo:** every word and voice is free on every device (Family). A school or
district licence adds more students per device. Try everything with a made-up student at
`/demo/` — nothing is saved. See
[`docs/adr/0009-licensing-and-demo.md`](docs/adr/0009-licensing-and-demo.md).

See [`docs/adr/0007-release-1-student-communicator.md`](docs/adr/0007-release-1-student-communicator.md)
and [`docs/adr/0008-research-based-vocabulary.md`](docs/adr/0008-research-based-vocabulary.md)
for the research behind each feature.

The Phase 0 device tests are still at `/spikes/`:

| Spike                                 | What it answers                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`/spikes/storage/`](spikes/storage/) | Does a SQLite database saved by the web app survive restarts, offline launches, a full disk, a week unopened and iPadOS updates?    |
| [`/spikes/voice/`](spikes/voice/)     | Can 200 pre-rendered phrases in an open neural voice play instantly and offline? How does that compare with the device's own voice? |

Design documents: [`docs/`](docs/) — start with `TECHNICAL_SPECIFICATION.md` and `adr/`.

---

## Set up on your computer (Windows or macOS)

You need [Node.js 22 LTS or newer](https://nodejs.org/) and
[Visual Studio Code](https://code.visualstudio.com/).

1. In VS Code: **File → Open Folder…** and choose this folder.
2. Accept the prompt to trust the folder.
3. Open the **NPM Scripts** panel: in the Explorer sidebar, expand **NPM SCRIPTS** (if it's hidden,
   click the `…` at the top of the Explorer and tick _NPM Scripts_).
4. The first time only: open **Terminal → New Terminal** and run `npm install` (VS Code has no
   button for installing dependencies). Everything else below runs from the NPM Scripts panel.
5. Hover a script in the NPM Scripts panel and click ▶ to run it:

| Script      | What it does                                                                               |
| ----------- | ------------------------------------------------------------------------------------------ |
| `dev`       | Starts a local server at `http://localhost:5173`. Ctrl/Cmd-click the link in the terminal. |
| `test`      | Runs the unit tests.                                                                       |
| `typecheck` | Checks TypeScript types.                                                                   |
| `format`    | Formats all files with Prettier.                                                           |
| `build`     | Type-checks and builds the production site into `dist/`.                                   |
| `check`     | Format check + typecheck + tests (what CI runs).                                           |

Recommended extensions (VS Code will offer them): Prettier, Vitest.

## Hosting: communicate.giftedtech.org (Cloudflare)

The live app is served free by Cloudflare (Workers static assets), which allows commercial use.
GitHub Pages does not allow sites used to run a business, so the Pages workflow is only for
testing and should be turned off once Cloudflare is live (GitHub → **Settings → Pages →**
unpublish, or delete `.github/workflows/pages.yml`).

One-time setup in the Cloudflare dashboard:

1. **Workers & Pages → Create → Import a repository**, choose `project-communicate`.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy` (Cloudflare reads
   `wrangler.jsonc`). Leave `BASE_PATH` unset so the app is served from `/`.
3. After the first deploy: the project's **Settings → Domains & Routes → Add → Custom domain**:
   `communicate.giftedtech.org`.

Every push to `main` then redeploys automatically.

**Moving students from the old github.io address:** each web address keeps its own data. For
each student, open the old address → **Adults → Download backup**; then at
`communicate.giftedtech.org` → **Adults → Restore from a backup**, and add the new address to the
Home Screen.

## Put it on a tablet

1. On an iPad, open `https://communicate.giftedtech.org` in **Safari** → Share → **Add to Home
   Screen** (keep _Open as Web App_ on) and open the new icon. On a Chromebook or Android tablet,
   open it in Chrome and choose **Install** from the address bar or menu.
2. Open it once while online. After that it works with no internet.
3. For the device tests, open `…/spikes/`, follow the steps on each page, and use **Export
   results** to send the files back.

## Repository layout

```text
index.html                  The communicator (Release 1)
src/app/                    App entry, layout and styles
src/core/                   Message model, settings, speech, repeat guard (pure, unit-tested)
src/core/                   …also morphology (endings), profiles, PIN, on-device store, backup
src/features/communicator/  Vocabulary, topic boards, board grid, keyboard, "My voice" strip
src/features/adult/         Adult hold, PIN pad, adult menu, word editor
scripts/                    Symbol selection for topic words (OpenMoji)
test/vocabulary.lock.json   Every released word's place; CI fails if one moves
public/symbols/openmoji/    The ~215 symbols used (OpenMoji, CC BY-SA 4.0)
spikes/                     Phase 0 device-test hub and pages
src/shared/                 Environment, stats, report export, service worker registration
src/spikes/storage/         SQLite-in-OPFS worker, integrity checks, canaries, UI
src/spikes/voice/           Voice engines, clip store, Web Audio player, system voice, UI
test/                       Vitest unit tests
docs/                       Requirements, spec, schema, API, security, test plan, ADRs
.github/workflows/          CI and GitHub Pages deployment
```

## Privacy

The communicator stores students' names (or nicknames), settings, added words and photos on the
device only, and sends nothing anywhere. Backup files hold that information unencrypted, so keep
them somewhere safe and private. Get the school's privacy approval before entering real students'
information. Speech uses the device's own voices; a voice labelled "needs internet" in the adult menu
sends the spoken text to the browser maker's service, so choose an on-device voice for students.
The spikes use synthetic data only and collect nothing. Exported reports contain timings, the
browser's user-agent string, storage figures and the test phrases — no personal information. The
voice spike downloads public voice models from Hugging Face on demand.
