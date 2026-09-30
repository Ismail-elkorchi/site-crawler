import type { NetworkSafetyPolicy } from "@ismail-elkorchi/http-client";
import type { ScopePolicy } from "../url/index.js";
import type { RedirectTargetDecision } from "../http/types.js";
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
    signal: AbortSignal,
  ): Promise<RedirectTargetDecision> {
    const scope = this.scope.decide(targetUrl, 0, seedUrl);
    const safety = await this.safety.decide(targetUrl, signal);
    const allowed = scope.allowed && safety.allowed;
    const rejectionKind = !scope.allowed
      ? "policy"
      : !safety.allowed
        ? safety.rejectionKind
        : null;
    return {
      allowed,
      rejectionKind,
      reason: scope.reason ?? safety.reason ?? null,
      scopeAllowed: scope.allowed,
      robotsAllowed: null,
      networkSafetyAllowed: rejectionKind === "dns" ? null : safety.allowed,
    };
  }
}
