import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlRequest } from "../requests/types.js";
import { abortableDelay } from "../runtime/abortable-delay.js";
import type { RequestOutcome } from "../crawler/types.js";
import { AvailabilityNotifier } from "./notifier.js";
import type { OriginStats, ThrottleChange } from "./types.js";

import { adjustedDelay, isFailure, type OriginSlot } from "./model.js";

export class PolitenessController {
  private readonly slots = new Map<string, OriginSlot>();
  private readonly notifier = new AvailabilityNotifier();
  private readonly config: ResolvedCrawlConfig;
  private readonly onChange: (change: ThrottleChange) => void;

  public constructor(
    config: ResolvedCrawlConfig,
    onChange: (change: ThrottleChange) => void = () => undefined,
  ) {
    this.config = config;
    this.onChange = onChange;
  }

  public tryReserve(request: CrawlRequest): boolean {
    const origin = new URL(request.normalizedUrl).origin;
    const slot = this.slot(origin);
    this.refillTokens(slot);
    if (slot.active >= this.config.network.maxConcurrencyPerOrigin)
      return false;
    if (Date.now() < this.eligibleAt(slot)) return false;
    if (this.usesRateLimit() && slot.tokens < 1) return false;
    slot.active += 1;
    if (this.usesRateLimit()) slot.tokens -= 1;
    return true;
  }

  public releaseReservation(request: CrawlRequest): void {
    const origin = new URL(request.normalizedUrl).origin;
    const slot = this.slot(origin);
    slot.active = Math.max(0, slot.active - 1);
    this.notifier.notify();
  }

  public async applyRobotsDelay(
    origin: string,
    minimumDelayMs: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (minimumDelayMs <= 0) return;
    const slot = this.slot(origin);
    const previous = slot.delayMs;
    slot.delayMs = Math.max(slot.delayMs, minimumDelayMs);
    slot.nextAllowedAt = Math.max(
      slot.nextAllowedAt,
      Date.now() + minimumDelayMs,
    );
    if (slot.delayMs !== previous) {
      this.onChange({
        origin,
        previousDelayMs: previous,
        delayMs: slot.delayMs,
        reason: "robots",
      });
    }
    const waitMs = Math.max(0, slot.nextAllowedAt - Date.now());
    if (waitMs > 0) await abortableDelay(waitMs, signal);
  }

  public release(origin: string, result: RequestOutcome): void {
    const slot = this.slot(origin);
    slot.active = Math.max(0, slot.active - 1);
    slot.requests += 1;
    slot.responseTimeTotalMs += result.responseTimeMs;
    slot.latencyTotalMs += result.latencyMs;
    const failed = isFailure(result);
    if (failed) slot.failures += 1;
    const previous = slot.delayMs;
    if (this.config.network.autoThrottle.enabled) {
      slot.delayMs = adjustedDelay(this.config, slot, result, failed);
    }
    const rateDelay = this.rateIntervalMs();
    slot.nextAllowedAt =
      Date.now() +
      Math.max(
        this.config.network.minDelayMsPerOrigin,
        rateDelay,
        slot.delayMs,
      );
    if (slot.delayMs !== previous) {
      this.onChange({
        origin,
        previousDelayMs: previous,
        delayMs: slot.delayMs,
        reason: failed ? "error" : "success",
      });
    }
    this.notifier.notify();
  }

  public nextEligibleAt(): number | null {
    let next: number | null = null;
    for (const slot of this.slots.values()) {
      if (slot.active >= this.config.network.maxConcurrencyPerOrigin) continue;
      this.refillTokens(slot);
      const eligible = this.eligibleAt(slot);
      if (next === null || eligible < next) next = eligible;
    }
    return next;
  }

  public async waitForAvailability(
    signal: AbortSignal,
    fallbackMs: number,
  ): Promise<void> {
    const next = this.nextEligibleAt();
    const waitMs =
      next === null
        ? fallbackMs
        : Math.max(1, Math.min(fallbackMs, next - Date.now()));
    await this.notifier.wait(signal, waitMs);
  }

  public stats(): readonly OriginStats[] {
    return [...this.slots.entries()].map(([origin, slot]) => ({
      origin,
      requests: slot.requests,
      failures: slot.failures,
      averageResponseTimeMs:
        slot.requests === 0 ? 0 : slot.responseTimeTotalMs / slot.requests,
      averageLatencyMs:
        slot.requests === 0 ? 0 : slot.latencyTotalMs / slot.requests,
      currentDelayMs: slot.delayMs,
      activeRequests: slot.active,
      nextEligibleAt: this.eligibleAt(slot),
    }));
  }

  private slot(origin: string): OriginSlot {
    const current = this.slots.get(origin);
    if (current !== undefined) return current;
    const now = Date.now();
    const created: OriginSlot = {
      active: 0,
      delayMs: this.config.network.autoThrottle.startDelayMs,
      nextAllowedAt: now,
      requests: 0,
      failures: 0,
      responseTimeTotalMs: 0,
      latencyTotalMs: 0,
      tokens: this.rateCapacity(),
      lastRefillAt: now,
    };
    this.slots.set(origin, created);
    return created;
  }

  private eligibleAt(slot: OriginSlot): number {
    if (!this.usesRateLimit() || slot.tokens >= 1) return slot.nextAllowedAt;
    const missing = 1 - slot.tokens;
    return Math.max(
      slot.nextAllowedAt,
      Date.now() + missing * this.rateIntervalMs(),
    );
  }

  private refillTokens(slot: OriginSlot): void {
    if (!this.usesRateLimit()) return;
    const now = Date.now();
    const elapsed = now - slot.lastRefillAt;
    slot.lastRefillAt = now;
    slot.tokens = Math.min(
      this.rateCapacity(),
      slot.tokens + elapsed / this.rateIntervalMs(),
    );
  }

  private usesRateLimit(): boolean {
    return this.config.network.maxRequestsPerMinutePerOrigin !== null;
  }

  private rateCapacity(): number {
    return Math.max(1, this.config.network.maxConcurrencyPerOrigin);
  }

  private rateIntervalMs(): number {
    const rate = this.config.network.maxRequestsPerMinutePerOrigin;
    return rate === null ? 0 : 60000 / rate;
  }
}

export type * from "./types.js";
