// Renders the listening-benchmark script (script.json) with cloud TTS engines,
// into the same folder layout as kokoro.ts, so measure.py, package.py and the
// listening test treat every engine alike.
//
//   node scripts/voice-benchmark/cloud.mjs <out-dir> [candidate-name ...]
//
// Keys come from environment variables; a candidate whose key is missing is
// skipped. Only this fixed benchmark text is sent: never student data.
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (default us-east-1)  Amazon Polly
//   AZURE_SPEECH_KEY, AZURE_SPEECH_REGION                                    Azure AI Speech
//   OPENAI_API_KEY                                                            OpenAI
//   CARTESIA_API_KEY                                                          Cartesia
//   ELEVENLABS_API_KEY                                                        ElevenLabs
//
// Acapela (Ella, Josh) has no public self-serve API: export WAVs of the same
// script from Acapela's demo or SDK into <out-dir>/acapela-ella-girl/ etc.,
// with the same file names, and they join the benchmark.
import { createHash, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HERE = new URL(".", import.meta.url);
const script = JSON.parse(readFileSync(new URL("script.json", HERE), "utf8"));
const [out, ...only] = process.argv.slice(2);
if (!out) throw new Error("usage: cloud.mjs <out-dir> [candidate ...]");

/** The candidates: who they are, and what each engine calls them. */
const CANDIDATES = [
  { name: "polly-ivy-girl", engine: "polly", voice: "Ivy" },
  { name: "polly-kevin-boy", engine: "polly", voice: "Kevin" },
  { name: "polly-justin-boy", engine: "polly", voice: "Justin" },
  { name: "azure-ana-girl", engine: "azure", voice: "en-US-AnaNeural" },
  { name: "azure-maisie-girl-uk", engine: "azure", voice: "en-GB-MaisieNeural" },
  { name: "cartesia-child", engine: "cartesia", voice: "2ee87190-8f84-4925-97da-e52547f9462c" },
  // OpenAI has no child voices; these are adult voices asked to sound young.
  {
    name: "openai-coral-girl-styled",
    engine: "openai",
    voice: "coral",
    instructions:
      "Speak as a bright, warm, friendly ten-year-old girl: clear, natural, unhurried, expressive.",
  },
  {
    name: "openai-ash-boy-styled",
    engine: "openai",
    voice: "ash",
    instructions:
      "Speak as a friendly, warm ten-year-old boy: clear, natural, unhurried, conversational.",
  },
  // ElevenLabs does not allow child or child-like voices in its library; an
  // adult "young" voice, for reference only. Set ELEVENLABS_VOICE_ID.
  {
    name: "elevenlabs-reference-adult",
    engine: "elevenlabs",
    voice: process.env.ELEVENLABS_VOICE_ID,
  },
];

const items = [
  ...script.short.map((t, i) => [`1-short-${i}`, t]),
  ...script.conversational.map((t, i) => [`2-conv-${i}`, t]),
  ...script.expressive.map((t, i) => [`3-expr-${i}`, t]),
  ["4-narration", script.narration],
];

function wav(path, pcm, rate) {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + pcm.length, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([b, pcm]));
}

/** Strips a WAV header if there is one, returning 16-bit PCM. */
function pcmOf(buf) {
  if (buf.subarray(0, 4).toString() !== "RIFF") return buf;
  let o = 12;
  while (o < buf.length - 8) {
    const id = buf.subarray(o, o + 4).toString();
    const n = buf.readUInt32LE(o + 4);
    if (id === "data") return buf.subarray(o + 8, o + 8 + n);
    o += 8 + n;
  }
  throw new Error("no data chunk");
}

/** Trims silence from a word clip (2% of peak, 15 ms kept), as the app does before joining. */
function trim(pcm, rate) {
  const n = pcm.length / 2;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
  const floor = peak * 0.02;
  let a = 0;
  while (a < n && Math.abs(pcm.readInt16LE(a * 2)) < floor) a++;
  let b = n;
  while (b > a && Math.abs(pcm.readInt16LE((b - 1) * 2)) < floor) b--;
  const pad = Math.round(rate * 0.015);
  return pcm.subarray(Math.max(0, a - pad) * 2, Math.min(n, b + pad) * 2);
}

// ── Engines: each returns { pcm, rate } (16-bit mono) ──

const sha = (s) => createHash("sha256").update(s).digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s).digest();

async function polly(c, text) {
  const region = process.env.AWS_REGION || "us-east-1";
  const host = `polly.${region}.amazonaws.com`;
  const body = JSON.stringify({
    Engine: "neural",
    OutputFormat: "pcm",
    SampleRate: "24000",
    Text: text,
    VoiceId: c.voice,
  });
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = now.slice(0, 8);
  const headers = { "content-type": "application/json", host, "x-amz-date": now };
  const signed = Object.keys(headers).sort().join(";");
  const canonical = [
    "POST",
    "/v1/speech",
    "",
    ...Object.keys(headers)
      .sort()
      .map((k) => `${k}:${headers[k]}`),
    "",
    signed,
    sha(body),
  ].join("\n");
  const scope = `${date}/${region}/polly/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", now, scope, sha(canonical)].join("\n");
  let key = hmac(`AWS4${process.env.AWS_SECRET_ACCESS_KEY}`, date);
  for (const part of [region, "polly", "aws4_request"]) key = hmac(key, part);
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  // fetch sets Host itself (it may not be set by hand); it is still signed.
  const sent = { "content-type": headers["content-type"], "x-amz-date": now, Authorization: auth };
  const r = await fetch(`https://${host}/v1/speech`, { method: "POST", headers: sent, body });
  if (!r.ok) throw new Error(`Polly ${r.status}: ${await r.text()}`);
  return { pcm: Buffer.from(await r.arrayBuffer()), rate: 24000 };
}

async function azure(c, text) {
  const region = process.env.AZURE_SPEECH_REGION;
  const lang = c.voice.slice(0, 5);
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${c.voice}">${esc}</voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-48khz-16bit-mono-pcm",
      "User-Agent": "communicate-voice-benchmark",
    },
    body: ssml,
  });
  if (!r.ok) throw new Error(`Azure ${r.status}: ${await r.text()}`);
  return { pcm: pcmOf(Buffer.from(await r.arrayBuffer())), rate: 48000 };
}

async function openai(c, text) {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: c.voice,
      input: text,
      instructions: c.instructions,
      response_format: "pcm",
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  return { pcm: Buffer.from(await r.arrayBuffer()), rate: 24000 };
}

async function cartesia(c, text) {
  const r = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": process.env.CARTESIA_API_KEY,
      "Cartesia-Version": "2025-04-16",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-3",
      transcript: text,
      voice: { mode: "id", id: c.voice },
      language: "en",
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 44100 },
    }),
  });
  if (!r.ok) throw new Error(`Cartesia ${r.status}: ${await r.text()}`);
  return { pcm: Buffer.from(await r.arrayBuffer()), rate: 44100 };
}

async function elevenlabs(c, text) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${c.voice}?output_format=pcm_44100`,
    {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  return { pcm: Buffer.from(await r.arrayBuffer()), rate: 44100 };
}

const ENGINES = { polly, azure, openai, cartesia, elevenlabs };
const READY = {
  polly: () => process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  azure: () => process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION,
  openai: () => process.env.OPENAI_API_KEY,
  cartesia: () => process.env.CARTESIA_API_KEY,
  elevenlabs: () => process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID,
};

for (const c of CANDIDATES) {
  if (only.length && !only.includes(c.name)) continue;
  if (!READY[c.engine]()) {
    console.log(`skip ${c.name}: no key`);
    continue;
  }
  const dir = `${out}/${c.name}`;
  mkdirSync(dir, { recursive: true });
  const say = (text) => ENGINES[c.engine](c, text);
  let chars = 0;
  for (const [id, text] of items) {
    const { pcm, rate } = await say(text);
    wav(`${dir}/${id}.wav`, pcm, rate);
    chars += text.length;
  }
  for (const [i, words] of script.assembled.entries()) {
    // Single words joined as the app joins clips (35 ms apart), and the sentence whole.
    const parts = [];
    let rate = 24000;
    for (const w of words) {
      const r = await say(w);
      rate = r.rate;
      parts.push(trim(r.pcm, rate), Buffer.alloc(Math.round(0.035 * rate) * 2));
      chars += w.length;
    }
    wav(`${dir}/5-assembled-${i}-joined.wav`, Buffer.concat(parts), rate);
    const sentence = words.join(" ");
    const whole = await say(sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".");
    wav(`${dir}/5-assembled-${i}-whole.wav`, whole.pcm, whole.rate);
    chars += sentence.length;
  }
  writeFileSync(`${dir}/settings.json`, JSON.stringify({ ...c, characters: chars }, null, 1));
  console.log(`${c.name}: done (${chars} characters)`);
}
