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

See [`docs/adr/0007-release-1-student-communicator.md`](docs/adr/0007-release-1-student-communicator.md)
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

## Put it on a tablet

The app must be served over HTTPS so devices can install it. GitHub Pages works and needs no
server.

1. Create a **private** repository on GitHub and push this folder to it (in VS Code: the
   **Source Control** view → **Publish to GitHub**).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The **Deploy to GitHub Pages** workflow runs on every push to `main`. When it finishes,
   the site is at `https://<your-user>.github.io/<repo-name>/`.
   - Private repositories need a GitHub plan that includes Pages for private repos; otherwise make
     the repository public (it contains no student data or secrets) or use another static host.
4. On an iPad, open that address in **Safari** → Share → **Add to Home Screen** (keep _Open as Web
   App_ on) and open the new icon. On a Chromebook or Android tablet, open it in Chrome and choose
   **Install** from the address bar or menu.
5. Open it once while online. After that it works with no internet.
6. For the device tests, open `…/spikes/`, follow the steps on each page, and use **Export
   results** to send the files back.

The full pass/fail criteria are in [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).

## Repository layout

```text
index.html                  The communicator (Release 1)
src/app/                    App entry, layout and styles
src/core/                   Message model, settings, speech, repeat guard (pure, unit-tested)
src/features/communicator/  Vocabulary, board, keyboard, "My voice" strip
src/features/adult/         Adult hold button and adult menu
public/symbols/openmoji/    The 36 symbols used (OpenMoji, CC BY-SA 4.0)
spikes/                     Phase 0 device-test hub and pages
src/shared/                 Environment, stats, report export, service worker registration
src/spikes/storage/         SQLite-in-OPFS worker, integrity checks, canaries, UI
src/spikes/voice/           Voice engines, clip store, Web Audio player, system voice, UI
test/                       Vitest unit tests
docs/                       Requirements, spec, schema, API, security, test plan, ADRs
.github/workflows/          CI and GitHub Pages deployment
```

## Privacy

The communicator stores only its display and voice settings, on the device, and sends nothing
anywhere. Speech uses the device's own voices; a voice labelled "needs internet" in the adult menu
sends the spoken text to the browser maker's service, so choose an on-device voice for students.
The spikes use synthetic data only and collect nothing. Exported reports contain timings, the
browser's user-agent string, storage figures and the test phrases — no personal information. The
voice spike downloads public voice models from Hugging Face on demand.
