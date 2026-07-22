export class AsyncSemaphore {
  private active = 0;
  private readonly limit: number;

  public constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Semaphore limit must be a positive integer.");
    this.limit = limit;
  }

  public async run<T>(
    signal: AbortSignal,
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.acquire(signal);
    try {
      return await operation();
    } finally {
      this.active -= 1;
    }
  }

  private async acquire(signal: AbortSignal): Promise<void> {
    while (this.active >= this.limit) await wait(10, signal);
    if (signal.aborted) throw abortError(signal);
    this.active += 1;
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Semaphore wait was aborted.");
}
