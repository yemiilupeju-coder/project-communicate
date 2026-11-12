/// <reference lib="webworker" />
/**
 * Storage spike worker: owns the SQLite database in the origin private file
 * system (OPFS) using the "opfs-sahpool" VFS, which works on Safari 16.4+ and
 * needs no special HTTP headers (so it can be hosted on GitHub Pages).
 *
 * It never falls back to an in-memory database: if OPFS can't be opened, the
 * spike reports that as a failure, because a silent fallback would make every
 * later result meaningless.
 */
import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import { expectedBlob, expectedPayload, sha256Hex, type IntegrityResult } from "./integrity";
import type {
  Envelope,
  LaunchInput,
  LaunchRow,
  OpenResult,
  Reply,
  WorkerRequest,
  WriteResult,
} from "./protocol";

const DB_FILE = "/communicate-storage-spike.sqlite3";

let db: Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS launches (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    build_id TEXT NOT NULL,
    standalone INTEGER NOT NULL,
    online INTEGER NOT NULL,
    persisted INTEGER,
    usage_bytes INTEGER,
    quota_bytes INTEGER,
    records_at_launch INTEGER NOT NULL,
    blobs_at_launch INTEGER NOT NULL,
    integrity_ok_at_launch INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    checksum TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blobs (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    seed INTEGER NOT NULL,
    size INTEGER NOT NULL,
    bytes BLOB NOT NULL,
    checksum TEXT NOT NULL
  );
`;

function requireDb(): Database {
  if (!db) throw new Error("Database is not open");
  return db;
}

function count(sql: string): number {
  const value = requireDb().selectValue(sql);
  return typeof value === "number" ? value : Number(value ?? 0);
}

function summary(sqliteVersion: string): OpenResult {
  const database = requireDb();
  const createdAt = database.selectValue("SELECT value FROM meta WHERE key = 'created_at'");
  return {
    sqliteVersion,
    vfs: "opfs-sahpool",
    databaseCreatedAt: typeof createdAt === "string" ? createdAt : "unknown",
    recordCount: count("SELECT COUNT(*) FROM records"),
    blobCount: count("SELECT COUNT(*) FROM blobs"),
    blobBytes: count("SELECT COALESCE(SUM(size), 0) FROM blobs"),
  };
}

let sqliteVersion = "";

async function open(): Promise<OpenResult> {
  if (db) return summary(sqliteVersion);
  const sqlite3 = await sqlite3InitModule();
  sqliteVersion = sqlite3.version.libVersion;
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    initialCapacity: 6,
    // Keep data if initialisation fails, so a failed launch can't wipe a good DB.
    preserveOnInitFailure: true,
  });
  db = new pool.OpfsSAHPoolDb(DB_FILE);
  db.exec(SCHEMA);
  db.exec({
    sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('created_at', ?)",
    bind: [new Date().toISOString()],
  });
  return summary(sqliteVersion);
}

function listLaunches(): LaunchRow[] {
  const rows = requireDb().selectObjects("SELECT * FROM launches ORDER BY id DESC");
  return rows.map((row) => ({
    id: Number(row.id),
    at: String(row.at),
    buildId: String(row.build_id),
    standalone: row.standalone === 1,
    online: row.online === 1,
    persisted: row.persisted === null ? null : row.persisted === 1,
    usageBytes: row.usage_bytes === null ? null : Number(row.usage_bytes),
    quotaBytes: row.quota_bytes === null ? null : Number(row.quota_bytes),
    recordsAtLaunch: Number(row.records_at_launch),
    blobsAtLaunch: Number(row.blobs_at_launch),
    integrityOkAtLaunch: row.integrity_ok_at_launch === 1,
  }));
}

function logLaunch(launch: LaunchInput): LaunchRow[] {
  const bool = (value: boolean | null) => (value === null ? null : value ? 1 : 0);
  requireDb().exec({
    sql: `INSERT INTO launches (at, build_id, standalone, online, persisted, usage_bytes,
            quota_bytes, records_at_launch, blobs_at_launch, integrity_ok_at_launch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      launch.at,
      launch.buildId,
      launch.standalone ? 1 : 0,
      launch.online ? 1 : 0,
      bool(launch.persisted),
      launch.usageBytes,
      launch.quotaBytes,
      launch.recordsAtLaunch,
      launch.blobsAtLaunch,
      launch.integrityOkAtLaunch ? 1 : 0,
    ],
  });
  return listLaunches();
}

async function writeRecords(howMany: number): Promise<WriteResult> {
  if (!Number.isInteger(howMany) || howMany < 1 || howMany > 10_000) {
    throw new RangeError("Record count must be between 1 and 10,000");
  }
  const started = performance.now();
  const database = requireDb();
  const firstId = count("SELECT COALESCE(MAX(id), 0) FROM records") + 1;
  const now = new Date().toISOString();
  // Checksums are async, so compute them before opening the transaction.
  const rows: Array<[number, string, string]> = [];
  for (let id = firstId; id < firstId + howMany; id += 1) {
    const payload = expectedPayload(id);
    rows.push([id, payload, await sha256Hex(payload)]);
  }
  database.transaction((tx) => {
    for (const [id, payload, checksum] of rows) {
      tx.exec({
        sql: "INSERT INTO records (id, created_at, payload, checksum) VALUES (?, ?, ?, ?)",
        bind: [id, now, payload, checksum],
      });
    }
  });
  const bytes = rows.reduce((sum, [, payload]) => sum + payload.length, 0);
  return {
    recordsWritten: howMany,
    blobsWritten: 0,
    bytesWritten: bytes,
    durationMs: performance.now() - started,
  };
}

async function writeBlob(sizeBytes: number): Promise<WriteResult> {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 64 * 1024 * 1024) {
    throw new RangeError("Blob size must be between 1 byte and 64 MB");
  }
  const started = performance.now();
  const database = requireDb();
  const id = count("SELECT COALESCE(MAX(id), 0) FROM blobs") + 1;
  const seed = id * 7919;
  const bytes = expectedBlob(seed, sizeBytes);
  const checksum = await sha256Hex(bytes);
  database.exec({
    sql: "INSERT INTO blobs (id, created_at, seed, size, bytes, checksum) VALUES (?, ?, ?, ?, ?, ?)",
    bind: [id, new Date().toISOString(), seed, sizeBytes, bytes, checksum],
  });
  return {
    recordsWritten: 0,
    blobsWritten: 1,
    bytesWritten: sizeBytes,
    durationMs: performance.now() - started,
  };
}

async function verify(): Promise<IntegrityResult> {
  const started = performance.now();
  const database = requireDb();
  const recordsBad: number[] = [];
  const records = database.selectObjects("SELECT id, payload, checksum FROM records ORDER BY id");
  for (const row of records) {
    const id = Number(row.id);
    const payload = String(row.payload);
    const matchesExpected = payload === expectedPayload(id);
    const matchesChecksum = (await sha256Hex(payload)) === row.checksum;
    if (!matchesExpected || !matchesChecksum) recordsBad.push(id);
  }
  const blobsBad: number[] = [];
  const blobs = database.selectObjects("SELECT id, seed, size, bytes, checksum FROM blobs");
  for (const row of blobs) {
    const id = Number(row.id);
    const stored = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array();
    const ok =
      stored.length === Number(row.size) &&
      (await sha256Hex(stored)) === row.checksum &&
      (await sha256Hex(expectedBlob(Number(row.seed), Number(row.size)))) === row.checksum;
    if (!ok) blobsBad.push(id);
  }
  return {
    recordsChecked: records.length,
    recordsBad,
    blobsChecked: blobs.length,
    blobsBad,
    durationMs: performance.now() - started,
  };
}

function reset(): OpenResult {
  const database = requireDb();
  database.transaction((tx) => {
    tx.exec("DELETE FROM records; DELETE FROM blobs; DELETE FROM launches; DELETE FROM meta;");
    tx.exec({
      sql: "INSERT INTO meta (key, value) VALUES ('created_at', ?)",
      bind: [new Date().toISOString()],
    });
  });
  database.exec("VACUUM");
  return summary(sqliteVersion);
}

async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.op) {
    case "open":
      return open();
    case "logLaunch":
      return logLaunch(request.launch);
    case "listLaunches":
      return listLaunches();
    case "writeRecords":
      return writeRecords(request.count);
    case "writeBlob":
      return writeBlob(request.sizeBytes);
    case "verify":
      return verify();
    case "reset":
      return reset();
  }
}

// Requests are handled one at a time so writes never interleave.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<Envelope>) => {
  const { requestId, request } = event.data;
  queue = queue.then(async () => {
    let reply: Reply;
    try {
      reply = { requestId, ok: true, result: await handle(request) };
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      reply = { requestId, ok: false, error: message };
    }
    (self as DedicatedWorkerGlobalScope).postMessage(reply);
  });
};
