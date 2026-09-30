import type { NetworkSafetyPolicy } from "@ismail-elkorchi/http-client";
import type { RobotsService } from "../robots/index.js";
import type { ScopePolicy } from "../url/index.js";
import type { CrawlCounters } from "./types.js";
import type { RedirectTargetDecision } from "../http/types.js";
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
    signal: AbortSignal,
  ): Promise<RedirectTargetDecision> {
    const scope = this.scope.decide(targetUrl, depth, seedUrl);
    const safety = await this.safety.decide(targetUrl, signal);
    const robots =
      scope.allowed && safety.allowed
        ? await this.robots.decide(targetUrl)
        : null;
    const allowed =
      scope.allowed && safety.allowed && (robots?.allowed ?? false);
    const rejectionKind = !scope.allowed
      ? "policy"
      : !safety.allowed
        ? safety.rejectionKind
        : !robots?.allowed
          ? "policy"
          : null;
    if (rejectionKind === "policy") this.counters.redirectsBlocked += 1;
    return {
      allowed,
      rejectionKind,
      reason: scope.reason ?? safety.reason ?? robots?.reason ?? null,
      scopeAllowed: scope.allowed,
      robotsAllowed: robots?.allowed ?? null,
      networkSafetyAllowed: rejectionKind === "dns" ? null : safety.allowed,
    };
  }
}
