import type { ResolvedCrawlConfig } from "../config/types.js";
import type { FetchResult } from "../http/index.js";
import type { NetworkSafetyDecision } from "../network/types.js";
import type { CrawlRequest } from "../requests/types.js";
import type { RobotsDecision } from "../robots/types.js";
import type { ScopeDecision } from "../url/types.js";

export interface ResourceDecisionInputs {
  readonly request: CrawlRequest;
  readonly fetchResult: FetchResult;
  readonly scopeDecision: ScopeDecision;
  readonly robotsDecision: RobotsDecision;
  readonly networkSafetyDecision: NetworkSafetyDecision;
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly signal: AbortSignal;
}
