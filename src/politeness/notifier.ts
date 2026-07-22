import { abortableDelay, AbortDelayError } from "../runtime/abortable-delay.js";

export class AvailabilityNotifier {
  private generation = 0;
  private readonly waiters = new Set<() => void>();

  public notify(): void {
    this.generation += 1;
    for (const resolve of this.waiters) resolve();
    this.waiters.clear();
  }

  public async wait(signal: AbortSignal, maxWaitMs: number): Promise<void> {
    const observed = this.generation;
    if (signal.aborted) return;
    let resolveWait: (() => void) | null = null;
    const notification = new Promise<void>((resolve) => {
      resolveWait = resolve;
      this.waiters.add(resolve);
    });
    try {
      await Promise.race([
        notification,
        abortableDelay(Math.max(1, maxWaitMs), signal),
      ]);
    } catch (caught) {
      if (!(caught instanceof AbortDelayError)) throw caught;
    } finally {
      if (resolveWait !== null) this.waiters.delete(resolveWait);
    }
    if (this.generation !== observed) return;
  }
}
