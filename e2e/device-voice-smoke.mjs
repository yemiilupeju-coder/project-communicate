// The child's voice for words added on the device and words typed on the
// keyboard: download the voice maker, add a word, and check it is said in
// the child's voice (as a clip, not the device voice), also offline.
// Run against `npx vite preview --port 4173`.
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
      Object.assign(this, { text, pitch: 1, rate: 1, voice: null, lang: "" });
    }
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak(u) {
        window.__device.push(u.text);
        setTimeout(() => u.onstart && u.onstart(), 5);
      },
      cancel() {},
      addEventListener() {},
      removeEventListener() {},
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
  page.evaluate(() => ({ clips: window.__clips, device: window.__device.slice() }));
const btn = (name) => page.getByRole("button", { name }).first();
const openAdult = async () => {
  const box = await btn(/Adult menu/).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
};
const wordSaved = (key) =>
  page.evaluate(async (k) => {
    const cache = await caches.open("communicate-voice-words");
    return (await cache.keys()).some((r) => r.url.endsWith("/" + encodeURIComponent(k)));
  }, key);

await page.goto(BASE);
await page.waitForSelector(".board .cell");
await openAdult();
await btn("Girl").click();
await page.getByText("The girl's voice is saved on this device").waitFor({ timeout: 30000 });
await btn("Download the voice maker").click();
const t0 = Date.now();
await page.getByText("Also said in the girl's voice").waitFor({ timeout: 180000 });
check(`voice maker downloads (${((Date.now() - t0) / 1000).toFixed(1)} s)`, true);

// Add "Biscuit" for this student; its clip is made in the background.
await btn("Edit words").click();
await btn(/^Topics$/).click();
await btn(/^People$/).click();
await btn("Add a word here: row 4, column 1").click();
await page.locator(".word-editor").getByLabel("Word on the button").fill("Biscuit");
await btn("Save word").click();
const t1 = Date.now();
let made = false;
while (!made && Date.now() - t1 < 120000) {
  await page.waitForTimeout(500);
  made = await wordSaved("biscuit");
}
check(
  `an added word gets a child-voice clip on the device (${((Date.now() - t1) / 1000).toFixed(1)} s)`,
  made,
);
await btn("Done editing").click();
await page.keyboard.press("Escape").catch(() => {});
const back = page.getByRole("button", { name: "Back to talking" });
if (await back.isVisible().catch(() => false)) await back.click();

let before = await counts();
await btn(/^Biscuit$/).click();
await page.waitForTimeout(800);
let now = await counts();
check(
  `tapping it plays the child-voice clip (${now.clips - before.clips} clips, device: ${JSON.stringify(now.device.slice(before.device.length))})`,
  now.clips > before.clips && now.device.length === before.device.length,
);

// A typed word: made on demand, then said in the child's voice.
await btn(/^Clear/)
  .click()
  .catch(() => {});
await btn(/^Keyboard$/).click();
for (const ch of "zib") await page.getByRole("button", { name: ch, exact: true }).first().click();
before = await counts();
const t2 = Date.now();
await btn(/Speak$/).click();
let spoke = false;
while (!spoke && Date.now() - t2 < 20000) {
  await page.waitForTimeout(300);
  now = await counts();
  spoke = now.clips > before.clips || now.device.length > before.device.length;
}
const firstWasClip = now.clips > before.clips;
check(
  `a typed word is said within ${((Date.now() - t2) / 1000).toFixed(1)} s (${firstWasClip ? "child voice" : "device voice while it was made"})`,
  spoke,
);
let typedSaved = false;
const t3 = Date.now();
while (!typedSaved && Date.now() - t3 < 60000) {
  await page.waitForTimeout(500);
  typedSaved = await wordSaved("zib");
}
before = await counts();
await btn(/Speak$/).click();
await page.waitForTimeout(800);
now = await counts();
check(
  `said again, it is in the child's voice (${now.clips - before.clips} clips)`,
  now.clips > before.clips && now.device.length === before.device.length,
);

// Offline: the added word is still said in the child's voice.
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForSelector(".board .cell");
await context.setOffline(true);
await page.reload();
await page.waitForSelector(".board .cell", { timeout: 15000 });
await btn(/^Topics$/).click();
await btn(/^People$/).click();
before = await counts();
await btn(/^Biscuit$/).click();
await page.waitForTimeout(800);
now = await counts();
check(
  `offline, the added word is still in the child's voice`,
  now.clips > before.clips && now.device.length === before.device.length,
);
await context.setOffline(false);
check(`no page errors ${errors.join(" | ")}`, errors.length === 0);
await browser.close();
