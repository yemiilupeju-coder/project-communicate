import type { EnvironmentSnapshot } from "./environment";

/** One spike run, exported as JSON for the Phase 0 report. */
export interface SpikeReport<TData> {
  format: "project-communicate-spike";
  formatVersion: 1;
  spike: "storage" | "voice";
  environment: EnvironmentSnapshot;
  data: TData;
}

export function buildReport<TData>(
  spike: SpikeReport<TData>["spike"],
  environment: EnvironmentSnapshot,
  data: TData,
): SpikeReport<TData> {
  return { format: "project-communicate-spike", formatVersion: 1, spike, environment, data };
}

export function reportFileName(spike: string, capturedAt: string): string {
  const stamp = capturedAt.replace(/[:.]/g, "-");
  return `communicate-${spike}-spike-${stamp}.json`;
}

/**
 * Hands the report to the user. Uses the share sheet where it accepts files
 * (iPad, Android), otherwise downloads the file.
 */
export async function exportReport(
  report: SpikeReport<unknown>,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const json = JSON.stringify(report, null, 2);
  const name = reportFileName(report.spike, report.environment.capturedAt);
  const file = new File([json], name, { type: "application/json" });

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return "shared";
    } catch (error) {
      // The user closed the share sheet on purpose; don't force a download.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
