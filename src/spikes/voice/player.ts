/**
 * Plays pre-rendered clips through Web Audio from decoded buffers held in
 * memory, so a tap does no disk access, decoding or network work.
 *
 * Latency is reported in two parts, both honestly labelled:
 *  - handlerMs: from the browser's touch event timestamp to the moment the
 *    sound is scheduled (measured).
 *  - outputLatencyMs: what the browser reports for its audio output path
 *    (an estimate from the platform; Safari may report 0 when unknown).
 * Ground truth needs an external check (slow-motion video of tap and sound);
 * see docs/TEST_PLAN.md.
 */

export interface PlayTiming {
  handlerMs: number;
  outputLatencyMs: number | null;
  estimatedTotalMs: number;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export class ClipPlayer {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<number, AudioBuffer>();
  private current: AudioBufferSourceNode[] = [];

  private ctx(): AudioContext {
    if (!this.context) {
      // Play as main audio, not ambient: keeps speaking when the device is muted
      // for notifications (Safari's Audio Session API, where supported).
      const nav = navigator as AudioSessionNavigator;
      if (nav.audioSession) nav.audioSession.type = "playback";
      this.context = new AudioContext({ latencyHint: "interactive" });
    }
    return this.context;
  }

  /** Must be called from inside a user gesture (any first tap). */
  async unlock(): Promise<void> {
    const context = this.ctx();
    if (context.state !== "running") await context.resume();
  }

  get state(): AudioContextState | "not-created" {
    return this.context?.state ?? "not-created";
  }

  get loadedCount(): number {
    return this.buffers.size;
  }

  has(index: number): boolean {
    return this.buffers.has(index);
  }

  async load(index: number, blob: Blob): Promise<void> {
    const data = await blob.arrayBuffer();
    this.buffers.set(index, await this.ctx().decodeAudioData(data));
  }

  clear(): void {
    this.stop();
    this.buffers.clear();
  }

  stop(): void {
    for (const source of this.current) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.current = [];
  }

  /**
   * Plays clips back to back. `eventTimeStamp` is the triggering event's
   * `timeStamp` (same clock as performance.now()).
   */
  play(indices: readonly number[], eventTimeStamp: number, gapSeconds = 0.06): PlayTiming {
    const context = this.ctx();
    this.stop(); // never two utterances at once
    let at = context.currentTime;
    for (const index of indices) {
      const buffer = this.buffers.get(index);
      if (!buffer) throw new Error(`Clip ${index} is not loaded`);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(at);
      this.current.push(source);
      at += buffer.duration + gapSeconds;
    }
    const handlerMs = Math.max(0, performance.now() - eventTimeStamp);
    const reported = (context.outputLatency || 0) + (context.baseLatency || 0);
    const outputLatencyMs = reported > 0 ? reported * 1000 : null;
    return { handlerMs, outputLatencyMs, estimatedTotalMs: handlerMs + (outputLatencyMs ?? 0) };
  }
}
