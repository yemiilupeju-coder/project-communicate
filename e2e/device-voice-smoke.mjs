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
    // What was played: sudden jumps between samples (clicks), and silent
    // gaps inside the speech (dropouts), for the smoothness checks.
    const x = this.buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    // A click is a lone spike in the signal's curvature, far above the
    // curvature around it (speech itself can change fast; it isn't lone).
    const d2 = new Float32Array(Math.max(0, x.length - 2));
    for (let i = 0; i < d2.length; i++) d2[i] = Math.abs(x[i + 2] - 2 * x[i + 1] + x[i]) / peak;
    const half = Math.round(this.buffer.sampleRate * 0.0025);
    let sum = 0;
    for (let i = 0; i < Math.min(d2.length, 2 * half); i++) sum += d2[i] ** 2;
    let clicks = 0;
    for (let i = half; i < d2.length - half; i++) {
      const local = Math.sqrt(sum / (2 * half));
      if (d2[i] > 6 * local + 0.02) clicks++;
      sum += d2[i + half] ** 2 - d2[i - half] ** 2;
    }
    const w = Math.round(this.buffer.sampleRate * 0.03);
    let first = 0;
    while (first < x.length && Math.abs(x[first]) < peak * 0.05) first++;
    let last = x.length - 1;
    while (last > first && Math.abs(x[last]) < peak * 0.05) last--;
    let longestQuiet = 0;
    let quiet = 0;
    for (let i = first; i < last; i += w) {
      let m = 0;
      for (let k = i; k < Math.min(last, i + w); k++) m = Math.max(m, Math.abs(x[k]));
      quiet = m < peak * 0.002 ? quiet + 1 : 0;
      longestQuiet = Math.max(longestQuiet, quiet);
    }
    window.__played = {
      seconds: x.length / this.buffer.sampleRate,
      clicks,
      edge: Math.max(Math.abs(x[0]), Math.abs(x[x.length - 1])) / peak,
      dropoutMs: longestQuiet * 30,
    };
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

// Whole sentences: always said in one go, never as flat joined words (Speak waits for it).
const tapWords = async (words, gap) => {
  for (const w of words) {
    await btn(new RegExp(`^${w}$`)).click();
    await page.waitForTimeout(gap);
  }
};
const speakCount = async (wait = 900) => {
  const b = await counts();
  await btn(/Speak$/).click();
  await page.waitForTimeout(wait);
  const n = await counts();
  return { clips: n.clips - b.clips, device: n.device.length - b.device.length };
};
await btn(/^Clear/).click();
await btn(/^Words$/).click();
await tapWords(["I", "can", "do", "it"], 0);
const atSpeak = await counts();
const tSpeak = Date.now();
await btn(/Speak$/).click();
let after = await counts();
while (after.clips === atSpeak.clips && Date.now() - tSpeak < 12000) {
  await page.waitForTimeout(250);
  after = await counts();
}
const waited = (Date.now() - tSpeak) / 1000;
await page.waitForTimeout(1500); // joined words would start several clips
after = await counts();
let said = {
  clips: after.clips - atSpeak.clips,
  device: after.device.length - atSpeak.device.length,
};
check(
  `a new sentence is said whole, not as joined words (${said.clips} clip, after ${waited.toFixed(1)} s)`,
  said.clips === 1 && said.device === 0,
);
let sentenceSaved = false;
const t4 = Date.now();
while (!sentenceSaved && Date.now() - t4 < 60000) {
  await page.waitForTimeout(500);
  sentenceSaved = await wordSaved("sentence:i can do it");
}
check(
  `the sentence is made whole and saved (${((Date.now() - t4) / 1000).toFixed(1)} s)`,
  sentenceSaved,
);
said = await speakCount();
check(
  `said again, it plays as one whole sentence (${said.clips} clip)`,
  said.clips === 1 && said.device === 0,
);
const played = await page.evaluate(() => window.__played);
check(
  `the sentence is smooth: ${played.clicks} clicks, silent at both ends, no dropouts (longest quiet ${played.dropoutMs} ms)`,
  played.clicks === 0 && played.edge < 0.01 && played.dropoutMs < 120,
);

// While the student pauses, the sentence is made ahead of Speak.
await btn(/^Clear/).click();
await tapWords(["you", "look", "good"], 300);
await page.waitForTimeout(8000);
said = await speakCount(250);
check(
  `a sentence built with a pause plays whole straight away (${said.clips} clip)`,
  said.clips === 1,
);

// Just after the app opens (as after an update), before the voice maker has
// loaded: a new sentence still waits to be said whole, never flat.
await page.reload();
await page.waitForSelector(".board .cell");
await btn(/^Words$/).click();
await tapWords(["it", "can", "look"], 0);
{
  const start = await counts();
  const t = Date.now();
  await btn(/Speak$/).click();
  let now = await counts();
  while (now.clips === start.clips && Date.now() - t < 15000) {
    await page.waitForTimeout(250);
    now = await counts();
  }
  const secs = (Date.now() - t) / 1000;
  await page.waitForTimeout(1500);
  now = await counts();
  check(
    `right after opening, a new sentence is said whole after ${secs.toFixed(1)} s (${now.clips - start.clips} clip)`,
    now.clips - start.clips === 1 && now.device.length === start.device.length,
  );
}

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
await btn(/^Clear/).click();
await btn(/^Words$/).click();
await tapWords(["I", "can", "do", "it"], 350);
said = await speakCount();
check(
  `offline, a saved sentence still plays whole (${said.clips} clip)`,
  said.clips === 1 && said.device === 0,
);
await context.setOffline(false);
check(`no page errors ${errors.join(" | ")}`, errors.length === 0);
await browser.close();
