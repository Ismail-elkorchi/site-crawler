export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  public async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = previous.then(
      () => current,
      () => current,
    );
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
