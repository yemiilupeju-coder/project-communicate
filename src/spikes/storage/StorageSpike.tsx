import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureEnvironment,
  formatBytes,
  readStorageStatus,
  requestPersistence,
  type EnvironmentSnapshot,
  type StorageStatus,
} from "../../shared/environment";
import { buildReport, exportReport } from "../../shared/results";
import { formatMs } from "../../shared/stats";
import { clearCanaries, readThenPlantCanaries, type CanaryState } from "./canaries";
import { StorageWorkerClient } from "./client";
import { integrityOk, type IntegrityResult } from "./integrity";
import type { LaunchRow, OpenResult, WriteResult } from "./protocol";

type Tone = "good" | "warn" | "bad";

function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

interface SpikeState {
  environment: EnvironmentSnapshot | null;
  storage: StorageStatus | null;
  opened: OpenResult | null;
  openError: string | null;
  integrity: IntegrityResult | null;
  canaries: CanaryState | null;
  launches: LaunchRow[];
  writes: WriteResult[];
  persistRequest: boolean | null | "not-asked";
}

const initialState: SpikeState = {
  environment: null,
  storage: null,
  opened: null,
  openError: null,
  integrity: null,
  canaries: null,
  launches: [],
  writes: [],
  persistRequest: "not-asked",
};

export function StorageSpike() {
  const clientRef = useRef<StorageWorkerClient | null>(null);
  const startedRef = useRef(false);
  const [state, setState] = useState<SpikeState>(initialState);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const client = useCallback(() => {
    clientRef.current ??= new StorageWorkerClient();
    return clientRef.current;
  }, []);

  // One launch = one page load. Record what survived, then log this launch.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const environment = await captureEnvironment();
      const canaries = await readThenPlantCanaries(environment.capturedAt);
      try {
        const opened = await client().call({ op: "open" });
        const integrity = await client().call({ op: "verify" });
        const launches = await client().call({
          op: "logLaunch",
          launch: {
            at: environment.capturedAt,
            buildId: __BUILD_ID__,
            standalone: environment.standalone,
            online: environment.online,
            persisted: environment.storage.persisted,
            usageBytes: environment.storage.usageBytes,
            quotaBytes: environment.storage.quotaBytes,
            recordsAtLaunch: opened.recordCount,
            blobsAtLaunch: opened.blobCount,
            integrityOkAtLaunch: integrityOk(integrity),
          },
        });
        setState((s) => ({
          ...s,
          environment,
          storage: environment.storage,
          opened,
          integrity,
          canaries,
          launches,
        }));
      } catch (error) {
        setState((s) => ({
          ...s,
          environment,
          storage: environment.storage,
          canaries,
          openError: error instanceof Error ? error.message : String(error),
        }));
      }
    })();
  }, [client]);

  const run = useCallback(async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const [opened, integrity, launches, storage] = await Promise.all([
      client().call({ op: "open" }),
      client().call({ op: "verify" }),
      client().call({ op: "listLaunches" }),
      readStorageStatus(),
    ]);
    setState((s) => ({ ...s, opened, integrity, launches, storage }));
  }, [client]);

  const onPersist = () =>
    run("Request persistent storage", async () => {
      const result = await requestPersistence();
      setState((s) => ({ ...s, persistRequest: result }));
      await refresh();
    });

  const onWrite = (blobMb: number) =>
    run(`Write test data (${blobMb} MB)`, async () => {
      const records = await client().call({ op: "writeRecords", count: 500 });
      const blob = await client().call({ op: "writeBlob", sizeBytes: blobMb * 1024 * 1024 });
      setState((s) => ({ ...s, writes: [...s.writes, records, blob] }));
      await refresh();
    });

  const onVerify = () => run("Verify", refresh);

  const onExport = () =>
    run("Export", async () => {
      const environment = await captureEnvironment();
      const outcome = await exportReport(
        buildReport("storage", environment, {
          buildId: __BUILD_ID__,
          opened: state.opened,
          openError: state.openError,
          integrity: state.integrity,
          canariesAtThisLaunch: state.canaries,
          persistRequest: state.persistRequest,
          launches: state.launches,
          writesThisSession: state.writes,
        }),
      );
      if (outcome !== "cancelled") setMessage(`Results ${outcome}.`);
    });

  const onReset = () => {
    if (!window.confirm("Delete all spike test data and the launch history on this device?")) {
      return;
    }
    void run("Reset", async () => {
      await client().call({ op: "reset" });
      await clearCanaries();
      setState((s) => ({ ...s, writes: [] }));
      await refresh();
    });
  };

  const { environment, storage, opened, openError, integrity, canaries, launches } = state;
  const integrityGood = integrity ? integrityOk(integrity) : null;
  const firstLaunch = launches.length > 0 ? launches[launches.length - 1] : undefined;

  return (
    <main>
      <h1>Storage spike</h1>
      <p className="lead">
        Does a database saved by this web app survive restarts, updates, a full disk and a week of
        not being opened? Each time you open this page it records a launch and checks every byte it
        wrote before.
      </p>

      {message && (
        <div className="banner" role="status">
          {message}
        </div>
      )}

      <h2>This device right now</h2>
      <div className="panel">
        {!environment ? (
          <p>Checking…</p>
        ) : (
          <table>
            <tbody>
              <tr>
                <th scope="row">Opened from Home Screen</th>
                <td>
                  {environment.standalone ? (
                    <Status tone="good">Yes</Status>
                  ) : (
                    <Status tone="warn">No — add to Home Screen and open from the icon</Status>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Storage marked persistent</th>
                <td>
                  {storage?.persisted === true && <Status tone="good">Yes</Status>}
                  {storage?.persisted === false && <Status tone="warn">No</Status>}
                  {storage?.persisted === null && <Status tone="warn">API not available</Status>}
                  {state.persistRequest !== "not-asked" && (
                    <span className="quiet">
                      {" "}
                      (last request returned {String(state.persistRequest)})
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Space used / quota</th>
                <td>
                  {formatBytes(storage?.usageBytes ?? null)} of{" "}
                  {formatBytes(storage?.quotaBytes ?? null)}
                </td>
              </tr>
              <tr>
                <th scope="row">Database</th>
                <td>
                  {opened && (
                    <Status tone="good">
                      SQLite {opened.sqliteVersion} in OPFS ({opened.vfs}), created{" "}
                      {opened.databaseCreatedAt}
                    </Status>
                  )}
                  {openError && <Status tone="bad">Could not open: {openError}</Status>}
                  {!opened && !openError && "Opening…"}
                </td>
              </tr>
              <tr>
                <th scope="row">Saved test data</th>
                <td>
                  {opened
                    ? `${opened.recordCount} records, ${opened.blobCount} blobs (${formatBytes(
                        opened.blobBytes,
                      )})`
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Integrity</th>
                <td>
                  {integrity === null && "—"}
                  {integrity && integrityGood && (
                    <Status tone="good">
                      Every byte matches ({integrity.recordsChecked} records,{" "}
                      {integrity.blobsChecked} blobs checked in {formatMs(integrity.durationMs)})
                    </Status>
                  )}
                  {integrity && !integrityGood && (
                    <Status tone="bad">
                      Mismatch: records {integrity.recordsBad.join(", ") || "none"}; blobs{" "}
                      {integrity.blobsBad.join(", ") || "none"}
                    </Status>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Other storage at launch</th>
                <td>
                  localStorage: {canaries?.localStorage ? "survived" : "empty"} · IndexedDB:{" "}
                  {canaries?.indexedDb ? "survived" : "empty"} · Cache:{" "}
                  {canaries?.cacheStorage ? "survived" : "empty"}
                  <div className="quiet">
                    “Empty” on the very first launch is expected. Later, it means the browser
                    cleared that storage.
                  </div>
                </td>
              </tr>
              <tr>
                <th scope="row">Build</th>
                <td>
                  <code>{__BUILD_ID__}</code>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="row">
        <button type="button" className="primary" onClick={onPersist} disabled={busy !== null}>
          Request persistent storage
        </button>
        <button type="button" onClick={() => onWrite(1)} disabled={busy !== null || !opened}>
          Write test data (1 MB)
        </button>
        <button type="button" onClick={() => onWrite(25)} disabled={busy !== null || !opened}>
          Write test data (25 MB)
        </button>
        <button type="button" onClick={onVerify} disabled={busy !== null || !opened}>
          Verify now
        </button>
        <button type="button" onClick={onExport} disabled={busy !== null}>
          Export results
        </button>
        <button type="button" onClick={onReset} disabled={busy !== null || !opened}>
          Reset
        </button>
      </div>
      {busy && <p role="status">{busy}…</p>}

      <h2>Test steps</h2>
      <ol className="steps">
        <li>
          In Safari, tap Share → <strong>Add to Home Screen</strong> (keep “Open as Web App” on).
          Close Safari and open the new icon.
        </li>
        <li>
          Tap <strong>Request persistent storage</strong>, then{" "}
          <strong>Write test data (1 MB)</strong>.
        </li>
        <li>Swipe the app away and reopen it. A new launch row should show the same data.</li>
        <li>Restart the iPad. Reopen.</li>
        <li>Turn on Airplane Mode. Reopen — the page itself must load offline.</li>
        <li>Leave the app unopened for at least 8 days (keep using Safari normally). Reopen.</li>
        <li>
          Fill the iPad until Settings shows under 1 GB free (e.g. record video). Reopen. Then free
          the space.
        </li>
        <li>After the next iPadOS update, reopen.</li>
        <li>
          Tap <strong>Export results</strong> after any step and send the file. Every launch row
          should show <em>integrity OK</em> and the same record count.
        </li>
      </ol>

      <h2>Launch history ({launches.length})</h2>
      {firstLaunch && (
        <p className="quiet">
          First launch recorded {firstLaunch.at}. A launch with fewer records than the one before it
          means data was lost.
        </p>
      )}
      <div className="panel" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>When</th>
              <th>Home Screen</th>
              <th>Online</th>
              <th>Persistent</th>
              <th>Records</th>
              <th>Blobs</th>
              <th>Integrity</th>
            </tr>
          </thead>
          <tbody>
            {launches.map((launch) => (
              <tr key={launch.id}>
                <td>{launch.id}</td>
                <td>{new Date(launch.at).toLocaleString()}</td>
                <td>{launch.standalone ? "yes" : "no"}</td>
                <td>{launch.online ? "yes" : "no"}</td>
                <td>{launch.persisted === null ? "?" : launch.persisted ? "yes" : "no"}</td>
                <td>{launch.recordsAtLaunch}</td>
                <td>{launch.blobsAtLaunch}</td>
                <td>
                  {launch.integrityOkAtLaunch ? (
                    <Status tone="good">OK</Status>
                  ) : (
                    <Status tone="bad">FAILED</Status>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <a href="../">← Back to all spikes</a>
      </p>
    </main>
  );
}
