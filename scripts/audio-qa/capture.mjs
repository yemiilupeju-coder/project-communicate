// Captures what the app actually plays, in a real browser (Chrome, via
// Playwright), at three points of the playback path:
//   1. every clip handed to Web Audio (its samples, and when it was scheduled)
//   2. the final mix leaving the AudioContext (a tap in front of the speakers)
//   3. every tap on the screen (to measure latency from tap to sound)
// plus any use of the device voice (speechSynthesis).
//
//   node scripts/audio-qa/capture.mjs <out-dir> [base-url]
//
// Needs `npx vite preview --port 4173` running, and playwright-core.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright-core");
const [out, BASE = "http://localhost:4173/"] = process.argv.slice(2);
if (!out) throw new Error("usage: capture.mjs <out-dir> [base-url]");
fs.mkdirSync(`${out}/clips`, { recursive: true });

const TAP = () => {
  window.__qa = {
    taps: [],
    starts: [],
    speech: [],
    chunks: [],
    rate: 0,
    latency: null,
    recStart: 0,
  };
  const qa = window.__qa;
  document.addEventListener(
    "pointerdown",
    (e) =>
      qa.taps.push({
        perf: performance.now(),
        label: (e.target.closest("button")?.innerText || "").trim().slice(0, 40),
      }),
    true,
  );
  const taps = new WeakMap();
  // An AudioWorklet sees every 128-sample block the context renders, in
  // order, with its exact frame number: a sample-accurate recording.
  const WORKLET = `class Rec extends AudioWorkletProcessor {
    constructor() { super(); this.buf = []; this.start = -1; }
    process(inputs) {
      const ch = inputs[0] && inputs[0][0];
      const data = ch ? ch.slice() : new Float32Array(128);
      if (this.start < 0) this.start = currentFrame;
      this.buf.push(data);
      if (this.buf.length >= 64) {
        const out = new Float32Array(this.buf.length * 128);
        this.buf.forEach((b, i) => out.set(b, i * 128));
        this.port.postMessage({ frame: this.start, data: out }, [out.buffer]);
        this.buf = []; this.start = -1;
      }
      return true;
    }
  }
  registerProcessor("qa-rec", Rec);`;
  const tapFor = (ctx) => {
    let t = taps.get(ctx);
    if (t) return t;
    const bus = ctx.createGain();
    origConnect.call(bus, ctx.destination);
    qa.rate = ctx.sampleRate;
    qa.latency = { base: ctx.baseLatency ?? null, output: ctx.outputLatency ?? null };
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    ctx.audioWorklet.addModule(url).then(() => {
      const rec = new AudioWorkletNode(ctx, "qa-rec", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      const mute = ctx.createGain();
      mute.gain.value = 0;
      origConnect.call(bus, rec);
      origConnect.call(rec, mute);
      origConnect.call(mute, ctx.destination);
      qa.recStart = ctx.currentTime;
      rec.port.onmessage = (e) => {
        const d = e.data.data;
        let loud = false;
        for (let i = 0; i < d.length; i += 4)
          if (Math.abs(d[i]) > 1e-6) {
            loud = true;
            break;
          }
        qa.chunks.push({ frame: e.data.frame, n: d.length, data: loud ? Array.from(d) : null });
      };
    });
    t = { bus };
    taps.set(ctx, t);
    return t;
  };
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      return origConnect.call(this, tapFor(this.context).bus, ...rest);
    }
    return origConnect.call(this, dest, ...rest);
  };
  // Start recording as soon as the app makes its AudioContext, not at the
  // first sound, so the first sound is recorded whole.
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      tapFor(this);
    }
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
    const b = this.buffer;
    qa.starts.push({
      perf: performance.now(),
      ctxNow: this.context.currentTime,
      when,
      rate: b.sampleRate,
      seconds: b.duration,
      data: Array.from(b.getChannelData(0)),
    });
    return start.call(this, when, ...rest);
  };
  if (window.speechSynthesis) {
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => {
      qa.speech.push({ perf: performance.now(), text: u.text });
      return speak(u);
    };
  }
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
await context.addInitScript(TAP);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true }).first();
const word = (w) => page.getByRole("button", { name: new RegExp(`^${w}$`) }).first();
const key = (c) =>
  page.getByRole("button", { name: c === " " ? "Space" : new RegExp(`^${c}$`, "i") }).first();
const marks = [];
const mark = (name) => marks.push({ name, perf: Date.now() });
async function openMenu() {
  const ad = await page.getByRole("button", { name: /Adult menu/ }).boundingBox();
  await page.mouse.move(ad.x + ad.width / 2, ad.y + ad.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await page.waitForTimeout(300);
}
async function voice(name) {
  await openMenu();
  await btn(name).click();
  await page
    .getByText(`The ${name.toLowerCase()}'s voice is saved on this device`)
    .waitFor({ timeout: 30000 });
  const maker = page.getByRole("button", { name: "Download the voice maker" });
  if (await maker.isVisible().catch(() => false)) {
    await maker.click();
    await page.getByText(/Also said in the/).waitFor({ timeout: 120000 });
  }
  await page.waitForTimeout(2500);
  await btn("Back to talking").click();
  await page.waitForTimeout(800);
}
async function tapWords(words, gap = 1000) {
  for (const w of words) {
    await word(w).click();
    await page.waitForTimeout(gap);
  }
}
async function speak(wait = 3500) {
  await btn("Speak").click();
  await page.waitForTimeout(wait);
}

await page.goto(BASE + "demo/");
await page.waitForSelector(".board .cell");
for (const who of ["Girl", "Boy"]) {
  await voice(who);
  mark(`${who}: words tapped one by one`);
  await tapWords(["I", "want", "more"]);
  mark(`${who}: Speak, first time`);
  await speak();
  mark(`${who}: Speak, again`);
  await speak();
  await btn("Clear").click();
  mark(`${who}: a strip phrase`);
  await btn("help me").click();
  await page.waitForTimeout(2500);
  mark(`${who}: typed sentence`);
  await btn("Keyboard").click();
  for (const c of "you are a superstar") {
    await key(c).click();
    await page.waitForTimeout(c === " " ? 500 : 160);
  }
  await page.waitForTimeout(1500);
  await speak();
  await btn("Clear").click();
  await btn("Words").click();
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1000);

const qa = await page.evaluate(() => {
  const q = window.__qa;
  return { ...q, origin: performance.timeOrigin };
});
// The final mix, as one file (silent blocks were stored as empty), placed by
// frame number, so a missing block would show as a gap.
const first = qa.chunks[0]?.frame ?? 0;
const last = qa.chunks.at(-1);
const mix = new Float32Array(last.frame + last.n - first);
for (const c of qa.chunks) if (c.data) mix.set(c.data, c.frame - first);
const wav = (path, x, rate) => {
  const b = Buffer.alloc(44 + x.length * 4);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + x.length * 4, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(32, 34);
  b.write("data", 36);
  b.writeUInt32LE(x.length * 4, 40);
  Buffer.from(x.buffer).copy(b, 44);
  fs.writeFileSync(path, b);
};
wav(`${out}/output.wav`, mix, qa.rate);
const clips = qa.starts.map((s, i) => {
  const file = `clips/${String(i).padStart(3, "0")}.wav`;
  wav(`${out}/${file}`, Float32Array.from(s.data), s.rate);
  return { file, perf: s.perf, ctxNow: s.ctxNow, when: s.when, rate: s.rate, seconds: s.seconds };
});
// Capture continuity: chunk times should follow each other exactly.
let captureGaps = 0;
for (let i = 1; i < qa.chunks.length; i++)
  if (qa.chunks[i].frame !== qa.chunks[i - 1].frame + qa.chunks[i - 1].n) captureGaps++;
fs.writeFileSync(
  `${out}/events.json`,
  JSON.stringify(
    {
      rate: qa.rate,
      outputStartsAt: first / qa.rate,
      latency: qa.latency,
      timeOrigin: qa.origin,
      taps: qa.taps,
      clips,
      speech: qa.speech,
      marks: marks.map((m) => ({ name: m.name, perf: m.perf - qa.origin })),
      captureGaps,
      errors,
    },
    null,
    1,
  ),
);
console.log(
  `captured ${(mix.length / qa.rate).toFixed(1)} s, ${clips.length} clips, ${qa.taps.length} taps, device voice ${qa.speech.length}, capture gaps ${captureGaps}, errors ${errors.length}`,
);
await browser.close();
