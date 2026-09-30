import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { SkipReason } from "../diagnostics/types.js";
import type { NetworkSafetyPolicy } from "@ismail-elkorchi/http-client";
import type { NetworkSafetyDecision } from "@ismail-elkorchi/http-client";
import type { CrawlRequest } from "../requests/types.js";
import type { RobotsService } from "../robots/index.js";
import type { RobotsDecision } from "../robots/types.js";
import type { ScopePolicy } from "../url/index.js";
import type { ScopeDecision } from "../url/types.js";
import type { SeedResolver } from "./seed-resolver.js";

export type RequestPolicyDecision =
  | { readonly kind: "fail"; readonly error: CrawlError }
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

  public async decide(
    request: CrawlRequest,
    signal: AbortSignal,
  ): Promise<RequestPolicyDecision> {
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
    const safety = await this.safety.decide(request.normalizedUrl, signal);
    if (!safety.allowed) {
      if (safety.rejectionKind === "dns") {
        return {
          kind: "fail",
          error: crawlError({
            code: "DNS_ERROR",
            message: safety.reason,
            url: request.normalizedUrl,
            requestId: request.id,
            retryable: true,
          }),
        };
      }
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
