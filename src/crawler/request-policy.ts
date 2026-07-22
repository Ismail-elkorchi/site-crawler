import type { SkipReason } from "../diagnostics/types.js";
import type { NetworkSafetyPolicy } from "../network/index.js";
import type { NetworkSafetyDecision } from "../network/types.js";
import type { CrawlRequest } from "../requests/types.js";
import type { RobotsService } from "../robots/index.js";
import type { RobotsDecision } from "../robots/types.js";
import type { ScopePolicy } from "../url/index.js";
import type { ScopeDecision } from "../url/types.js";
import type { SeedResolver } from "./seed-resolver.js";

export type RequestPolicyDecision =
  | {
      readonly kind: "allow";
      readonly scope: ScopeDecision;
      readonly safety: NetworkSafetyDecision;
      readonly robots: RobotsDecision;
    }
  | {
      readonly kind: "skip";
      readonly reason: SkipReason;
      readonly policyName: string;
      readonly detail: string | null;
    };

export class RequestPolicyRunner {
  private readonly scope: ScopePolicy;
  private readonly safety: NetworkSafetyPolicy;
  private readonly robots: RobotsService;
  private readonly seeds: SeedResolver;

  public constructor(
    scope: ScopePolicy,
    safety: NetworkSafetyPolicy,
    robots: RobotsService,
    seeds: SeedResolver,
  ) {
    this.scope = scope;
    this.safety = safety;
    this.robots = robots;
    this.seeds = seeds;
  }

  public async decide(request: CrawlRequest): Promise<RequestPolicyDecision> {
    const seed = this.seeds.forRequest(request);
    const scope = this.scope.decide(
      request.normalizedUrl,
      request.depth,
      seed?.normalizedUrl ?? null,
    );
    if (!scope.allowed) {
      return {
        kind: "skip",
        reason: "SCOPE_REJECTED",
        policyName: scope.policyName ?? "scope",
        detail: scope.reason,
      };
    }
    const safety = await this.safety.decide(request.normalizedUrl);
    if (!safety.allowed) {
      return {
        kind: "skip",
        reason: "NETWORK_SAFETY_REJECTED",
        policyName: "networkSafety",
        detail: safety.reason,
      };
    }
    const robots = await this.robots.decide(
      request.normalizedUrl,
      request.source === "seed",
    );
    if (!robots.allowed) {
      return {
        kind: "skip",
        reason: "ROBOTS_DISALLOWED",
        policyName: "robots",
        detail: robots.reason,
      };
    }
    return { kind: "allow", scope, safety, robots };
  }
}
