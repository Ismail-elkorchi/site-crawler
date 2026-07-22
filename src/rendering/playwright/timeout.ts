export class PlaywrightOperationTimeoutError extends Error {
  public readonly operation: string;
  public readonly timeoutMs: number;

  public constructor(operation: string, timeoutMs: number) {
    super(`${operation} exceeded ${timeoutMs} ms.`);
    this.name = "PlaywrightOperationTimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export async function withPlaywrightTimeout<T>(
  operation: Promise<T>,
  operationName: string,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new PlaywrightOperationTimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
