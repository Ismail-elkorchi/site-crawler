import { nowIso } from "../core/utils.js";
import type {
  CrawlRequest,
  RequestState,
  RequestStateRecord,
} from "../requests/types.js";

export function createRequestStateRecord(
  runId: string,
  request: CrawlRequest,
  state: RequestState,
  reason: string | null,
): RequestStateRecord {
  return {
    schemaId: "site-crawler.requestState",
    schemaVersion: 1,
    runId,
    requestId: request.id,
    uniqueKey: request.uniqueKey,
    state,
    reason,
    updatedAt: nowIso(),
  };
}
