import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { captureEnvironment, formatBytes } from "../../shared/environment";
import { buildReport, exportReport } from "../../shared/results";
import { formatMs, summarize, type TimingSummary } from "../../shared/stats";
import { clipKey, clipPrefix, deleteClips, listClips, putClip } from "./clipStore";
import {
  ENGINES,
  engineById,
  type EngineId,
  type LoadProgress,
  type VoiceRenderer,
} from "./engines";
import { SPIKE_VOCABULARY, TEST_SENTENCE } from "./phrases";
import { ClipPlayer, type PlayTiming } from "./player";
import {
  listSystemVoices,
  speakAndMeasure,
  systemSpeechAvailable,
  type SystemVoiceInfo,
} from "./systemVoice";

interface TapSample extends PlayTiming {
  kind: "clip" | "sentence";
  text: string;
  online: boolean;
  at: string;
}

interface SystemSample {
  text: string;
  voiceURI: string | null;
  startMs: number | null;
  online: boolean;
  at: string;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading"; progress: LoadProgress }
  | { status: "ready"; loadMs: number; backend: string }
  | { status: "error"; error: string };

const SENTENCE_INDICES = TEST_SENTENCE.map((word) => SPIKE_VOCABULARY.indexOf(word));

function SummaryLine({ label, summary }: { label: string; summary: TimingSummary }) {
  return (
    <p>
      <strong>{label}:</strong> {summary.count} samples · median {formatMs(summary.median)} · p95{" "}
      {formatMs(summary.p95)} · max {formatMs(summary.max)}
    </p>
  );
}

export function VoiceSpike() {
  const playerRef = useRef(new ClipPlayer());
  const rendererRef = useRef<VoiceRenderer | null>(null);
  const cancelRef = useRef(false);

  const [engineId, setEngineId] = useState<EngineId>("kokoro");
  const [voiceId, setVoiceId] = useState<string>(engineById("kokoro").voices[0]?.id ?? "");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [stored, setStored] = useState<Map<number, { renderMs: number; bytes: number }>>(new Map());
  const [rendering, setRendering] = useState<{ done: number; total: number } | null>(null);
  const [renderTimes, setRenderTimes] = useState<number[]>([]);
  const [taps, setTaps] = useState<TapSample[]>([]);
  const [systemVoices, setSystemVoices] = useState<SystemVoiceInfo[]>([]);
  const [systemVoiceURI, setSystemVoiceURI] = useState<string | null>(null);
  const [systemSamples, setSystemSamples] = useState<SystemSample[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  const engine = engineById(engineId);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // Any first tap anywhere unlocks audio (iOS requires a user gesture).
    const unlock = () => void playerRef.current.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!systemSpeechAvailable()) return;
    void listSystemVoices().then((voices) => {
      setSystemVoices(voices);
      const preferred =
        voices.find((v) => v.localService && v.lang.startsWith("en-CA")) ??
        voices.find((v) => v.localService && v.lang.startsWith("en"));
      setSystemVoiceURI(preferred?.voiceURI ?? null);
    });
  }, []);

  // Load clips already rendered for this engine + voice into memory.
  const loadStoredClips = useCallback(async () => {
    const player = playerRef.current;
    player.clear();
    const clips = await listClips(clipPrefix(engineId, voiceId));
    const next = new Map<number, { renderMs: number; bytes: number }>();
    for (const clip of clips) {
      await player.load(clip.index, clip.blob);
      next.set(clip.index, { renderMs: clip.renderMs, bytes: clip.blob.size });
    }
    setStored(next);
  }, [engineId, voiceId]);

  useEffect(() => {
    rendererRef.current = null;
    setLoadState({ status: "idle" });
    void loadStoredClips().catch((error: unknown) =>
      setMessage(`Could not load saved clips: ${String(error)}`),
    );
  }, [loadStoredClips]);

  const onLoadModel = async () => {
    setMessage(null);
    const started = performance.now();
    setLoadState({ status: "loading", progress: { fraction: null, text: "Starting…" } });
    try {
      const renderer = await engine.load(voiceId, (progress) =>
        setLoadState({ status: "loading", progress }),
      );
      rendererRef.current = renderer;
      setLoadState({
        status: "ready",
        loadMs: performance.now() - started,
        backend: renderer.backend,
      });
    } catch (error) {
      setLoadState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const onRenderAll = async () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    cancelRef.current = false;
    setMessage(null);
    const todo = SPIKE_VOCABULARY.map((text, index) => ({ text, index })).filter(
      ({ index }) => !stored.has(index),
    );
    setRendering({ done: 0, total: todo.length });
    let done = 0;
    try {
      for (const { text, index } of todo) {
        if (cancelRef.current) break;
        const started = performance.now();
        const blob = await renderer.render(text);
        const renderMs = performance.now() - started;
        await putClip({
          key: clipKey(engineId, voiceId, index),
          engine: engineId,
          voice: voiceId,
          index,
          text,
          blob,
          renderMs,
          createdAt: new Date().toISOString(),
        });
        await playerRef.current.load(index, blob);
        done += 1;
        setStored((prev) => new Map(prev).set(index, { renderMs, bytes: blob.size }));
        setRenderTimes((prev) => [...prev, renderMs]);
        setRendering({ done, total: todo.length });
      }
    } catch (error) {
      setMessage(`Rendering stopped: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRendering(null);
    }
  };

  const onDeleteClips = async () => {
    if (!window.confirm(`Delete all saved clips for ${engine.label} · ${voiceId}?`)) return;
    await deleteClips(clipPrefix(engineId, voiceId));
    setRenderTimes([]);
    await loadStoredClips();
  };

  const playIndices = (
    indices: readonly number[],
    kind: TapSample["kind"],
    text: string,
    event: MouseEvent,
  ) => {
    const player = playerRef.current;
    void player.unlock();
    try {
      const timing = player.play(indices, event.timeStamp);
      setTaps((prev) => [
        ...prev,
        { ...timing, kind, text, online: navigator.onLine, at: new Date().toISOString() },
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const onSystemSpeak = async (text: string, event: MouseEvent) => {
    const timeStamp = event.timeStamp;
    const startMs = await speakAndMeasure(text, systemVoiceURI, timeStamp);
    setSystemSamples((prev) => [
      ...prev,
      {
        text,
        voiceURI: systemVoiceURI,
        startMs,
        online: navigator.onLine,
        at: new Date().toISOString(),
      },
    ]);
  };

  const onExport = async () => {
    const environment = await captureEnvironment();
    const clipBytes = [...stored.values()].reduce((sum, clip) => sum + clip.bytes, 0);
    const outcome = await exportReport(
      buildReport("voice", environment, {
        buildId: __BUILD_ID__,
        engine: engineId,
        voice: voiceId,
        modelLoad: loadState,
        clipsStored: stored.size,
        clipBytes,
        renderTimesThisSession: summarize(renderTimes),
        renderTimesAllStored: summarize([...stored.values()].map((clip) => clip.renderMs)),
        tapSummaryOnline: summarize(taps.filter((t) => t.online).map((t) => t.estimatedTotalMs)),
        tapSummaryOffline: summarize(taps.filter((t) => !t.online).map((t) => t.estimatedTotalMs)),
        taps,
        systemVoices: systemVoices.map(({ name, lang, localService }) => ({
          name,
          lang,
          localService,
        })),
        systemSamples,
      }),
    );
    if (outcome !== "cancelled") setMessage(`Results ${outcome}.`);
  };

  const clipTaps = taps.filter((t) => t.kind === "clip");
  const sentenceTaps = taps.filter((t) => t.kind === "sentence");
  const storedRenderTimes = [...stored.values()].map((clip) => clip.renderMs);
  const clipBytes = [...stored.values()].reduce((sum, clip) => sum + clip.bytes, 0);
  const sentenceReady = SENTENCE_INDICES.every((i) => i >= 0 && stored.has(i));
  const busy = loadState.status === "loading" || rendering !== null;
  const localSystemVoices = systemVoices.filter((v) => v.localService);

  return (
    <main>
      <h1>Voice spike</h1>
      <p className="lead">
        Can buttons speak from pre-rendered clips instantly and offline, in a voice that sounds the
        same on every device?
      </p>
      <p className="quiet">
        Status: {online ? "online" : "offline"} · audio {playerRef.current.state} · build{" "}
        <code>{__BUILD_ID__}</code>
      </p>

      {message && (
        <div className="banner" role="status">
          {message}
        </div>
      )}

      <h2>1. Choose and load a voice</h2>
      <div className="panel">
        <div className="row">
          <label>
            Engine{" "}
            <select
              value={engineId}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as EngineId;
                setEngineId(next);
                setVoiceId(engineById(next).voices[0]?.id ?? "");
              }}
            >
              {ENGINES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Voice{" "}
            <select value={voiceId} disabled={busy} onChange={(e) => setVoiceId(e.target.value)}>
              {engine.voices.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" onClick={onLoadModel} disabled={busy}>
            Download and load model
          </button>
        </div>
        <p className="quiet">{engine.note} Loading needs a network the first time only.</p>
        {loadState.status === "loading" && (
          <p role="status">
            {loadState.progress.text}
            {loadState.progress.fraction !== null &&
              ` — ${Math.round(loadState.progress.fraction * 100)}%`}
          </p>
        )}
        {loadState.status === "ready" && (
          <p className="status good">
            Loaded in {formatMs(loadState.loadMs)} using {loadState.backend}
          </p>
        )}
        {loadState.status === "error" && <p className="status bad">{loadState.error}</p>}
      </div>

      <h2>2. Render the 200 test phrases</h2>
      <div className="panel">
        <p>
          {stored.size} of {SPIKE_VOCABULARY.length} clips saved on this device (
          {formatBytes(clipBytes)}).
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={onRenderAll}
            disabled={
              busy || loadState.status !== "ready" || stored.size === SPIKE_VOCABULARY.length
            }
          >
            Render missing clips
          </button>
          <button
            type="button"
            onClick={() => {
              cancelRef.current = true;
            }}
            disabled={rendering === null}
          >
            Stop rendering
          </button>
          <button type="button" onClick={onDeleteClips} disabled={busy || stored.size === 0}>
            Delete saved clips
          </button>
        </div>
        {rendering && (
          <p role="status">
            Rendering {rendering.done} / {rendering.total}…
          </p>
        )}
        {storedRenderTimes.length > 0 && (
          <SummaryLine label="Render time per clip" summary={summarize(storedRenderTimes)} />
        )}
      </div>

      <h2>3. Tap test</h2>
      <div className="panel">
        <p>
          Tap buttons at a natural pace. Then turn on Airplane Mode, swipe the app away, reopen it
          and tap again — clips must still play.
        </p>
        {clipTaps.length > 0 && (
          <SummaryLine
            label="Tap to sound, single clips (estimate)"
            summary={summarize(clipTaps.map((t) => t.estimatedTotalMs))}
          />
        )}
        {sentenceTaps.length > 0 && (
          <SummaryLine
            label="Tap to sound, four-clip sentence (estimate)"
            summary={summarize(sentenceTaps.map((t) => t.estimatedTotalMs))}
          />
        )}
        <div className="row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="primary"
            disabled={!sentenceReady}
            onClick={(e) => playIndices(SENTENCE_INDICES, "sentence", TEST_SENTENCE.join(" "), e)}
          >
            Speak sentence: “{TEST_SENTENCE.join(" ")}”
          </button>
          <button type="button" onClick={() => playerRef.current.stop()}>
            Stop speaking
          </button>
        </div>
        <div className="grid">
          {SPIKE_VOCABULARY.map((text, index) => (
            <button
              key={index}
              type="button"
              disabled={!stored.has(index)}
              onClick={(e) => playIndices([index], "clip", text, e)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <h2>4. Compare with the device's own voice</h2>
      <div className="panel">
        {!systemSpeechAvailable() ? (
          <p>This browser has no built-in speech.</p>
        ) : (
          <>
            <p>
              {systemVoices.length} voices reported, {localSystemVoices.length} marked as working
              offline.
            </p>
            <div className="row">
              <label>
                Voice{" "}
                <select
                  value={systemVoiceURI ?? ""}
                  onChange={(e) => setSystemVoiceURI(e.target.value || null)}
                >
                  <option value="">Default</option>
                  {systemVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}){v.localService ? "" : " — network"}
                    </option>
                  ))}
                </select>
              </label>
              {["help", "I need a break.", "I want more."].map((text) => (
                <button key={text} type="button" onClick={(e) => void onSystemSpeak(text, e)}>
                  {text}
                </button>
              ))}
            </div>
            {systemSamples.length > 0 && (
              <SummaryLine
                label="Tap to speech start, system voice"
                summary={summarize(
                  systemSamples.flatMap((s) => (s.startMs === null ? [] : [s.startMs])),
                )}
              />
            )}
            {systemSamples.some((s) => s.startMs === null) && (
              <p className="status bad">
                {systemSamples.filter((s) => s.startMs === null).length} attempt(s) never started
                speaking.
              </p>
            )}
          </>
        )}
      </div>

      <h2>5. Send results</h2>
      <div className="row">
        <button type="button" className="primary" onClick={() => void onExport()}>
          Export results
        </button>
      </div>
      <p className="quiet">
        The export contains timings, device model string, voice names and the test phrases — no
        personal information.
      </p>
      <p>
        <a href="../">← Back to all spikes</a>
      </p>
    </main>
  );
}
