import { describe, expect, it } from "vitest";
import { soundSpan } from "../src/core/clipPlayer";
import { clipKey, sentenceKey, sentenceText } from "../src/core/voicePack";
import { JobQueue } from "../src/voice/jobQueue";

describe("sentence keys", () => {
  it("keeps sentences apart from words, and keeps how they end", () => {
    expect(sentenceKey("I can do it")).toBe("sentence:i can do it");
    expect(sentenceKey("I can do it!")).toBe("sentence:i can do it!");
    expect(sentenceKey("you're done?")).toBe("sentence:you're done?");
    expect(sentenceKey("I can do it")).not.toBe(clipKey("I can do it"));
  });

  it("gives a sentence an ending so it is said as a whole statement", () => {
    expect(sentenceText("I can do it")).toBe("I can do it.");
    expect(sentenceText("  you are  a superstar! ")).toBe("you are a superstar!");
    expect(sentenceText("is it lunch?")).toBe("is it lunch?");
  });
});

describe("trimming joined clips", () => {
  const sr = 24000;
  const clip = (silenceBefore: number, sound: number, silenceAfter: number) => {
    const x = new Float32Array(Math.round((silenceBefore + sound + silenceAfter) * sr));
    const a = Math.round(silenceBefore * sr);
    for (let i = 0; i < Math.round(sound * sr); i++) x[a + i] = 0.5 * Math.sin(i / 7);
    return x;
  };

  it("cuts the silence around a word, leaving 15 ms either side", () => {
    const [start, end] = soundSpan(clip(0.1, 0.3, 0.2), sr);
    expect(start / sr).toBeCloseTo(0.085, 2);
    expect(end / sr).toBeCloseTo(0.415, 2);
  });

  it("keeps quiet sounds at the end of a word (a soft 's' or 't')", () => {
    const x = clip(0.05, 0.2, 0.2);
    const tail = Math.round(0.25 * sr);
    for (let i = 0; i < Math.round(0.05 * sr); i++) x[tail + i] = 0.03 * Math.sin(i * 1.3);
    const [, end] = soundSpan(x, sr);
    expect(end / sr).toBeGreaterThan(0.3);
  });

  it("handles silence", () => {
    expect(soundSpan(new Float32Array(100), sr)).toEqual([0, 0]);
  });
});

describe("voice maker order", () => {
  const later = () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    return { gate, release };
  };

  it("does urgent work before background work, one job at a time", async () => {
    const q = new JobQueue<string>();
    const order: string[] = [];
    const first = later();
    const job = (name: string, gate?: Promise<void>) => async () => {
      order.push(name);
      await gate;
      return name;
    };
    const a = q.add("a", "later", job("a", first.gate), "dropped");
    const b = q.add("b", "later", job("b"), "dropped");
    const c = q.add("c", "now", job("c"), "dropped");
    expect(q.running()).toBe("a");
    expect(q.pending().map((p) => p.key)).toEqual(["c", "b"]);
    first.release();
    expect(await Promise.all([a, b, c])).toEqual(["a", "b", "c"]);
    expect(order).toEqual(["a", "c", "b"]);
  });

  it("keeps only the newest guess", async () => {
    const q = new JobQueue<string>();
    const first = later();
    q.add("busy", "now", async () => (await first.gate, "busy"), "dropped");
    const old = q.add("i can", "soon", async () => "i can", "dropped");
    const latest = q.add("i can do it", "soon", async () => "i can do it", "dropped");
    expect(q.pending().map((p) => p.key)).toEqual(["i can do it"]);
    expect(await old).toBe("dropped");
    first.release();
    expect(await latest).toBe("i can do it");
  });

  it("joins a request for something already queued, and hurries it", async () => {
    const q = new JobQueue<string>();
    const first = later();
    let runs = 0;
    q.add("busy", "now", async () => (await first.gate, "busy"), "dropped");
    q.add("x", "later", async () => "y", "dropped");
    const guess = q.add("s", "soon", async () => (runs++, "s"), "dropped");
    const spoken = q.add("s", "now", async () => (runs++, "s"), "dropped");
    expect(q.pending()).toEqual([
      { key: "s", priority: "now" },
      { key: "x", priority: "later" },
    ]);
    first.release();
    expect(await guess).toBe("s");
    expect(await spoken).toBe("s");
    expect(runs).toBe(1);
  });

  it("holds background work while audio plays, but never Speak", async () => {
    let playing = true;
    const q = new JobQueue<string>(() => playing);
    const order: string[] = [];
    const later = q.add("bg", "later", async () => (order.push("bg"), "bg"), "dropped");
    const now = q.add("speak", "now", async () => (order.push("speak"), "speak"), "dropped");
    expect(await now).toBe("speak");
    await new Promise((r) => setTimeout(r, 400));
    expect(order).toEqual(["speak"]);
    playing = false;
    expect(await later).toBe("bg");
    expect(order).toEqual(["speak", "bg"]);
  });

  it("carries on after a job fails", async () => {
    const q = new JobQueue<string>();
    const bad = q.add("bad", "now", async () => Promise.reject(new Error("no")), "dropped");
    const good = q.add("good", "now", async () => "good", "dropped");
    expect(await bad).toBe("dropped");
    expect(await good).toBe("good");
  });
});

describe("sample-rate conversion for playback", () => {
  it("converts 24 kHz to 44.1 and 48 kHz cleanly", async () => {
    const { convertRate } = await import("../src/core/rateConvert");
    const tone = (rate: number, n: number) =>
      new Float32Array(n).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / rate));
    for (const to of [44100, 48000]) {
      const out = convertRate(tone(24000, 24000), 24000, to);
      expect(out.length).toBe(to);
      const ideal = tone(to, to);
      let err = 0;
      let sig = 0;
      for (let i = 200; i < out.length - 200; i++) {
        err += (out[i]! - ideal[i]!) ** 2;
        sig += ideal[i]! ** 2;
      }
      expect(10 * Math.log10(sig / err)).toBeGreaterThan(60); // better than 60 dB SNR
    }
  });
});
