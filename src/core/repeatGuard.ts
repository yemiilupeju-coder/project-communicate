/**
 * Ignores a repeat activation of the same button within `windowMs`
 * (decision D21: 300 ms by default, adjustable). This stops a tremor or a
 * double bounce from saying a word twice, without slowing deliberate taps on
 * different buttons.
 */
export class RepeatGuard {
  private readonly last = new Map<string, number>();

  constructor(private windowMs: number) {}

  setWindow(windowMs: number): void {
    this.windowMs = Math.max(0, windowMs);
  }

  /** Returns true if this activation should go ahead. */
  allow(key: string, now: number): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < this.windowMs) return false;
    this.last.set(key, now);
    return true;
  }
}
