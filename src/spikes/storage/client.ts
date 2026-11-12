import type { Envelope, Reply, WorkerRequest, WorkerResultMap } from "./protocol";

/** Promise wrapper around the storage worker. */
export class StorageWorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor() {
    this.worker = new Worker(new URL("./storage.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const entry = this.pending.get(reply.requestId);
      if (!entry) return;
      this.pending.delete(reply.requestId);
      if (reply.ok) entry.resolve(reply.result);
      else entry.reject(new Error(reply.error));
    };
    this.worker.onerror = (event) => {
      const error = new Error(`Storage worker failed: ${event.message || "unknown error"}`);
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  call<R extends WorkerRequest>(request: R): Promise<WorkerResultMap[R["op"]]> {
    const requestId = this.nextId++;
    const envelope: Envelope = { requestId, request };
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as WorkerResultMap[R["op"]]),
        reject,
      });
      this.worker.postMessage(envelope);
    });
  }
}
