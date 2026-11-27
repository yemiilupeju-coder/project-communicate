/**
 * The order the voice maker works in. It makes one clip at a time, so a
 * student pressing Speak must not wait behind background work.
 *
 * - "now": someone is waiting to hear it (Speak, or a missing word).
 * - "soon": a guess at the sentence being built; only the newest guess is
 *   kept, because older ones are already out of date.
 * - "later": background work (words added for a student, saved sentences).
 */

export type Priority = "now" | "soon" | "later";
const RANK: Readonly<Record<Priority, number>> = { now: 0, soon: 1, later: 2 };

export interface Job<T> {
  readonly key: string;
  priority: Priority;
  readonly run: () => Promise<T>;
  readonly done: Promise<T>;
  /** What the job resolves with if it is replaced or fails. */
  readonly dropped: T;
}

export class JobQueue<T> {
  private readonly waiting: Job<T>[] = [];
  private readonly settle = new Map<Job<T>, (value: T) => void>();
  private busy: Job<T> | null = null;
  private held = false;

  /**
   * Holds back "soon" and "later" jobs while `hold()` is true (for example
   * while audio plays, so making clips never competes with playing them).
   */
  constructor(private readonly hold: () => boolean = () => false) {}

  /** Jobs not yet started (for tests). */
  pending(): readonly { key: string; priority: Priority }[] {
    return this.waiting.map(({ key, priority }) => ({ key, priority }));
  }

  /** The job running now, if any. */
  running(): string | null {
    return this.busy?.key ?? null;
  }

  /**
   * Adds a job, or returns the same key's job if it is already queued or
   * running (raising its priority if this request is more urgent). A newer
   * "soon" job replaces an older one that hasn't started; the replaced job
   * resolves with `dropped`.
   */
  add(key: string, priority: Priority, run: () => Promise<T>, dropped: T): Promise<T> {
    if (this.busy?.key === key) return this.busy.done;
    const queued = this.waiting.find((job) => job.key === key);
    if (queued) {
      if (RANK[priority] < RANK[queued.priority]) queued.priority = priority;
      this.sort();
      return queued.done;
    }
    if (priority === "soon") {
      for (const old of this.waiting.filter((job) => job.priority === "soon")) {
        this.waiting.splice(this.waiting.indexOf(old), 1);
        this.settle.get(old)?.(dropped);
        this.settle.delete(old);
      }
    }
    let resolve!: (value: T) => void;
    const done = new Promise<T>((r) => (resolve = r));
    const job: Job<T> = { key, priority, run, done, dropped };
    this.settle.set(job, resolve);
    this.waiting.push(job);
    this.sort();
    void this.next();
    return done;
  }

  private sort(): void {
    // Stable: same priority keeps arrival order.
    this.waiting.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  }

  private async next(): Promise<void> {
    if (this.busy || this.waiting.length === 0 || this.held) return;
    if (this.waiting[0]!.priority !== "now" && this.hold()) {
      this.held = true;
      setTimeout(() => {
        this.held = false;
        void this.next();
      }, 150);
      return;
    }
    const job = this.waiting.shift()!;
    this.busy = job;
    const resolve = this.settle.get(job)!;
    this.settle.delete(job);
    try {
      resolve(await job.run());
    } catch {
      resolve(job.dropped);
    } finally {
      this.busy = null;
      void this.next();
    }
  }
}
