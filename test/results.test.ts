import { describe, expect, it } from "vitest";
import type { EnvironmentSnapshot } from "../src/shared/environment";
import { buildReport, reportFileName } from "../src/shared/results";
import { describeHfProgress } from "../src/spikes/voice/engines";

const environment: EnvironmentSnapshot = {
  capturedAt: "2026-11-09T19:30:00.123Z",
  userAgent: "test",
  standalone: true,
  online: false,
  screen: { width: 1024, height: 1366, pixelRatio: 2 },
  storage: { apiAvailable: true, persisted: true, usageBytes: 10, quotaBytes: 100 },
  webgpu: false,
};

describe("reports", () => {
  it("wraps data in a versioned envelope", () => {
    const report = buildReport("storage", environment, { ok: true });
    expect(report).toEqual({
      format: "project-communicate-spike",
      formatVersion: 1,
      spike: "storage",
      environment,
      data: { ok: true },
    });
  });

  it("builds a file name that is safe on every OS", () => {
    expect(reportFileName("voice", environment.capturedAt)).toBe(
      "communicate-voice-spike-2026-11-09T19-30-00-123Z.json",
    );
  });

  it("serializes to JSON without losing fields", () => {
    const report = buildReport("voice", environment, { samples: [1, 2, 3] });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});

describe("describeHfProgress", () => {
  it("reports download fractions", () => {
    expect(
      describeHfProgress({ status: "progress", file: "onnx/model_quantized.onnx", progress: 42 }),
    ).toEqual({ fraction: 0.42, text: "Downloading model_quantized.onnx" });
  });

  it("handles ready, unknown and malformed events", () => {
    expect(describeHfProgress({ status: "ready" })).toEqual({ fraction: 1, text: "Model ready" });
    expect(describeHfProgress({ status: "initiate", file: "config.json" }).text).toBe(
      "Preparing config.json",
    );
    expect(describeHfProgress(null)).toEqual({ fraction: null, text: "Loading…" });
  });
});
