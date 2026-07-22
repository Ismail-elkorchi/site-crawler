import type { FetchResult } from "./types.js";

export function combineRequestSignals(
  timeoutSignal: AbortSignal,
  externalSignal: AbortSignal | undefined,
): AbortSignal {
  return externalSignal === undefined
    ? timeoutSignal
    : AbortSignal.any([timeoutSignal, externalSignal]);
}

export function shouldTryNextAddress(
  result: FetchResult,
  signal: AbortSignal,
): boolean {
  if (signal.aborted) return false;
  return (
    result.error?.code === "FETCH_NETWORK_ERROR" ||
    result.error?.code === "TLS_ERROR"
  );
}
