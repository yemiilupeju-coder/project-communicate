/**
 * Open neural voices that run inside the browser. Both are loaded on demand
 * (dynamic import) so the storage spike and the hub never download them.
 *
 * In the product these run on the ADULT's device when a board is saved
 * (concept 4, "voice as data"); the spike also runs them on the tablet to
 * measure how slow that is.
 */

export type EngineId = "kokoro" | "piper";

export interface LoadProgress {
  /** 0..1 when known, otherwise null. */
  fraction: number | null;
  text: string;
}

export interface VoiceOption {
  id: string;
  label: string;
}

export interface VoiceRenderer {
  readonly engine: EngineId;
  readonly voice: string;
  /** Describes the compute backend actually used, e.g. "webgpu" or "wasm". */
  readonly backend: string;
  render(text: string): Promise<Blob>;
}

export interface EngineInfo {
  id: EngineId;
  label: string;
  note: string;
  voices: readonly VoiceOption[];
  load(voice: string, onProgress: (progress: LoadProgress) => void): Promise<VoiceRenderer>;
}

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

const kokoro: EngineInfo = {
  id: "kokoro",
  label: "Kokoro 82M",
  note: "≈ 90 MB download (q8). Uses WebGPU when available, otherwise WebAssembly.",
  voices: [
    { id: "af_heart", label: "Heart (US English, female)" },
    { id: "af_bella", label: "Bella (US English, female)" },
    { id: "am_michael", label: "Michael (US English, male)" },
    { id: "bf_emma", label: "Emma (UK English, female)" },
  ],
  async load(voice, onProgress) {
    const { KokoroTTS } = await import("kokoro-js");
    const backend = "gpu" in navigator ? "webgpu" : "wasm";
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      // fp32 is recommended for WebGPU; q8 keeps the WebAssembly path small.
      dtype: backend === "webgpu" ? "fp32" : "q8",
      device: backend,
      progress_callback: (info: unknown) => onProgress(describeHfProgress(info)),
    });
    return {
      engine: "kokoro",
      voice,
      backend,
      async render(text) {
        const audio = await tts.generate(text, { voice: voice as never });
        return audio.toBlob();
      },
    };
  },
};

const piper: EngineInfo = {
  id: "piper",
  label: "Piper",
  note: "≈ 60–75 MB per voice. WebAssembly only; fast on CPU.",
  voices: [
    { id: "en_US-hfc_female-medium", label: "HFC female (US English)" },
    { id: "en_US-hfc_male-medium", label: "HFC male (US English)" },
    { id: "en_GB-alba-medium", label: "Alba (UK English, female)" },
    { id: "fr_FR-siwis-medium", label: "Siwis (French, female)" },
  ],
  async load(voice, onProgress) {
    const { TtsSession } = await import("@mintplex-labs/piper-tts-web");
    // TtsSession keeps a singleton; clear it so a different voice really loads.
    TtsSession._instance = null;
    const session = await TtsSession.create({
      voiceId: voice,
      progress: ({ loaded, total, url }) =>
        onProgress({
          fraction: total > 0 ? loaded / total : null,
          text: `Downloading ${shortName(url)}`,
        }),
    });
    return {
      engine: "piper",
      voice,
      backend: "wasm",
      render: (text) => session.predict(text),
    };
  },
};

export const ENGINES: readonly EngineInfo[] = [kokoro, piper];

export function engineById(id: EngineId): EngineInfo {
  const engine = ENGINES.find((candidate) => candidate.id === id);
  if (!engine) throw new Error(`Unknown engine ${id}`);
  return engine;
}

function shortName(url: string): string {
  const last = url.split("/").pop() ?? url;
  return last.length > 40 ? `${last.slice(0, 37)}…` : last;
}

/** Turns a transformers.js progress event into something showable. */
export function describeHfProgress(info: unknown): LoadProgress {
  if (typeof info !== "object" || info === null) return { fraction: null, text: "Loading…" };
  const event = info as { status?: string; file?: string; progress?: number };
  const file = event.file ? shortName(event.file) : "model";
  switch (event.status) {
    case "progress":
      return {
        fraction: typeof event.progress === "number" ? event.progress / 100 : null,
        text: `Downloading ${file}`,
      };
    case "done":
      return { fraction: 1, text: `Downloaded ${file}` };
    case "ready":
      return { fraction: 1, text: "Model ready" };
    default:
      return { fraction: null, text: `Preparing ${file}` };
  }
}
