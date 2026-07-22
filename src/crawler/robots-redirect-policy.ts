import type { NetworkSafetyPolicy } from "../network/index.js";
import type { ScopePolicy } from "../url/index.js";
import type { RedirectTargetDecision } from "./redirect-target-policy.js";
export class RobotsRedirectPolicy {
  private readonly scope: ScopePolicy;
  private readonly safety: NetworkSafetyPolicy;
  public constructor(scope: ScopePolicy, safety: NetworkSafetyPolicy) {
    this.scope = scope;
    this.safety = safety;
  }
  public async decide(
    targetUrl: string,
    seedUrl: string,
  ): Promise<RedirectTargetDecision> {
    const scope = this.scope.decide(targetUrl, 0, seedUrl);
    const safety = await this.safety.decide(targetUrl);
    const allowed = scope.allowed && safety.allowed;
    return {
      allowed,
      reason: scope.reason ?? safety.reason ?? null,
      scopeAllowed: scope.allowed,
      robotsAllowed: null,
      networkSafetyAllowed: safety.allowed,
    };
  }
}
