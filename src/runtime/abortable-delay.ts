export class AbortDelayError extends Error {
  public override readonly name = "AbortDelayError";
}

export async function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (milliseconds <= 0) return;
  if (signal.aborted) throw new AbortDelayError("Operation was cancelled.");
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new AbortDelayError("Operation was cancelled."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
