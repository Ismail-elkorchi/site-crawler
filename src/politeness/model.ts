import type { ResolvedCrawlConfig } from "../config/types.js";
import type { RequestOutcome } from "../crawler/types.js";

export interface OriginSlot {
  active: number;
  delayMs: number;
  nextAllowedAt: number;
  requests: number;
  failures: number;
  responseTimeTotalMs: number;
  latencyTotalMs: number;
  tokens: number;
  lastRefillAt: number;
}

export function adjustedDelay(
  config: ResolvedCrawlConfig,
  slot: OriginSlot,
  result: RequestOutcome,
  failed: boolean,
): number {
  const throttle = config.network.autoThrottle;
  const target = clamp(
    result.latencyMs / throttle.targetConcurrencyPerOrigin,
    throttle.minDelayMs,
    throttle.maxDelayMs,
  );
  if (failed) {
    return Math.max(
      slot.delayMs,
      target,
      Math.min(slot.delayMs * 2, throttle.maxDelayMs),
    );
  }
  return Math.round(
    clamp(
      slot.delayMs * (1 - throttle.smoothing) + target * throttle.smoothing,
      throttle.minDelayMs,
      throttle.maxDelayMs,
    ),
  );
}

export function isFailure(result: RequestOutcome): boolean {
  return (
    result.kind === "transport-failed" ||
    result.kind === "request-failed" ||
    result.statusCode === 429 ||
    result.statusCode === 500 ||
    result.statusCode === 502 ||
    result.statusCode === 503 ||
    result.statusCode === 504
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
