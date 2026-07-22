import type { NetworkSafetyPolicy } from "../network/index.js";
import type { RobotsService } from "../robots/index.js";
import type { ScopePolicy } from "../url/index.js";
import type { CrawlCounters } from "./types.js";
export interface RedirectTargetDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly scopeAllowed: boolean | null;
  readonly robotsAllowed: boolean | null;
  readonly networkSafetyAllowed: boolean | null;
}
export class RedirectTargetPolicy {
  private readonly scope: ScopePolicy;
  private readonly safety: NetworkSafetyPolicy;
  private readonly robots: RobotsService;
  private readonly counters: CrawlCounters;
  public constructor(
    scope: ScopePolicy,
    safety: NetworkSafetyPolicy,
    robots: RobotsService,
    counters: CrawlCounters,
  ) {
    this.scope = scope;
    this.safety = safety;
    this.robots = robots;
    this.counters = counters;
  }
  public async decide(
    targetUrl: string,
    depth: number,
    seedUrl: string,
  ): Promise<RedirectTargetDecision> {
    const scope = this.scope.decide(targetUrl, depth, seedUrl);
    const safety = await this.safety.decide(targetUrl);
    const robots =
      scope.allowed && safety.allowed
        ? await this.robots.decide(targetUrl)
        : null;
    const allowed =
      scope.allowed && safety.allowed && (robots?.allowed ?? false);
    if (!allowed) this.counters.redirectsBlocked += 1;
    return {
      allowed,
      reason: scope.reason ?? safety.reason ?? robots?.reason ?? null,
      scopeAllowed: scope.allowed,
      robotsAllowed: robots?.allowed ?? null,
      networkSafetyAllowed: safety.allowed,
    };
  }
}
