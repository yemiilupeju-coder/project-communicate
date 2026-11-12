import type { IntegrityResult } from "./integrity";

/** Messages between the storage spike page and its SQLite worker. */

export interface OpenResult {
  sqliteVersion: string;
  vfs: "opfs-sahpool";
  databaseCreatedAt: string;
  recordCount: number;
  blobCount: number;
  blobBytes: number;
}

export interface LaunchInput {
  at: string;
  buildId: string;
  standalone: boolean;
  online: boolean;
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
  recordsAtLaunch: number;
  blobsAtLaunch: number;
  integrityOkAtLaunch: boolean;
}

export interface LaunchRow extends LaunchInput {
  id: number;
}

export interface WriteResult {
  recordsWritten: number;
  blobsWritten: number;
  bytesWritten: number;
  durationMs: number;
}

export type WorkerRequest =
  | { op: "open" }
  | { op: "logLaunch"; launch: LaunchInput }
  | { op: "listLaunches" }
  | { op: "writeRecords"; count: number }
  | { op: "writeBlob"; sizeBytes: number }
  | { op: "verify" }
  | { op: "reset" };

export type WorkerResultMap = {
  open: OpenResult;
  logLaunch: LaunchRow[];
  listLaunches: LaunchRow[];
  writeRecords: WriteResult;
  writeBlob: WriteResult;
  verify: IntegrityResult;
  reset: OpenResult;
};

export interface Envelope {
  requestId: number;
  request: WorkerRequest;
}

export type Reply =
  | { requestId: number; ok: true; result: unknown }
  | { requestId: number; ok: false; error: string };
