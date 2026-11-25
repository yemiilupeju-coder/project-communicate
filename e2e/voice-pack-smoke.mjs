// Child voice packs: choosing one downloads it, built-in words play as clips
// (not the device voice), typed words fall back to the device voice, and the
// pack keeps working offline. Run against `npx vite preview --port 4173`.
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
await context.addInitScript(() => {
  window.__clips = 0;
  window.__device = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    window.__clips++;
    return start.apply(this, args);
  };
  const voices = [
    { voiceURI: "Samantha", name: "Samantha", lang: "en-US", localService: true, default: true },
  ];
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.pitch = 1;
      this.rate = 1;
      this.voice = null;
      this.lang = "";
    }
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak(u) {
        window.__device.push({ text: u.text, pitch: u.pitch });
        setTimeout(() => u.onstart && u.onstart(), 5);
      },
      cancel() {},
      addEventListener() {},
      removeEventListener() {},
      speaking: false,
      pending: false,
      paused: false,
    },
  });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) process.exitCode = 1;
};
const counts = () =>
  page.evaluate(() => ({
    clips: window.__clips,
    device: window.__device.length,
    last: window.__device.at(-1),
  }));
const tap = (w) =>
  page
    .getByRole("button", { name: new RegExp(`^${w}$`) })
    .first()
    .click();

await page.goto(BASE);
await page.waitForSelector(".board .cell");
const ad = await page.getByRole("button", { name: /Adult menu/ }).boundingBox();
await page.mouse.move(ad.x + ad.width / 2, ad.y + ad.height / 2);
await page.mouse.down();
await page.waitForTimeout(3300);
await page.mouse.up();
await page.getByRole("button", { name: "Girl", exact: true }).click();
await page
  .getByText("The girl's voice is saved on this device and works offline.")
  .waitFor({ timeout: 20000 });
check("choosing Girl downloads the pack and says it works offline", true);
await page.waitForTimeout(600);
let c = await counts();
check(
  `the sample plays as a clip (${c.clips} clip starts, ${c.device} device)`,
  c.clips >= 1 && c.device === 0,
);
await page.getByRole("button", { name: "Back to talking" }).click();

const before = await counts();
for (const w of ["I", "want", "more"]) {
  await tap(w);
  await page.waitForTimeout(250);
}
await page
  .getByRole("button", { name: /Speak$/ })
  .first()
  .click();
await page.waitForTimeout(500);
c = await counts();
check(
  `built-in words and the sentence play as clips (${c.clips - before.clips} clip starts)`,
  c.clips - before.clips >= 6 && c.device === before.device,
);

await page
  .getByRole("button", { name: /^Clear/ })
  .first()
  .click()
  .catch(() => {});
await tap("Keyboard").catch(() => {});
await page.waitForTimeout(300);
for (const ch of "zib") await page.getByRole("button", { name: ch, exact: true }).first().click();
await page
  .getByRole("button", { name: /Speak$/ })
  .first()
  .click();
await page.waitForTimeout(400);
c = await counts();
check(
  `a typed word uses the device voice at a raised pitch (${JSON.stringify(c.last)})`,
  c.device > before.device && c.last.pitch > 1,
);

// Offline: reload with the network off; the saved pack still speaks.
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForSelector(".board .cell");
await context.setOffline(true);
await page.reload();
await page.waitForSelector(".board .cell", { timeout: 15000 });
const off0 = await counts();
await tap("go");
await page.waitForTimeout(600);
c = await counts();
check(
  `offline, a word still plays as a clip (${c.clips - off0.clips})`,
  c.clips - off0.clips >= 1 && c.device === off0.device,
);
await context.setOffline(false);
check(`no page errors ${errors.join(" | ")}`, errors.length === 0);
await browser.close();
