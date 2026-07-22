import type { EnqueueDecision } from "../links/types.js";
import type { CrawlRequest, CrawlSource } from "../requests/types.js";
import type { SkippedUrl } from "../results/types.js";
import type { FrontierOrder } from "./types.js";
export function priorityForSource(source: CrawlSource): number {
  switch (source) {
    case "seed":
      return 100;
    case "robots-sitemap":
      return 90;
    case "sitemap-index":
      return 80;
    case "sitemap":
      return 70;
    case "html-link":
      return 60;
    case "javascript-static":
      return 50;
    case "css-static":
      return 45;
    case "feed":
      return 40;
    case "redirect":
      return 30;
    case "manual":
      return 20;
    case "hook":
      return 10;
  }
}
export function sortRequests(
  queue: CrawlRequest[],
  order: FrontierOrder,
): void {
  if (order !== "priority") return;
  queue.sort(
    (left, right) =>
      right.priority - left.priority ||
      left.depth - right.depth ||
      left.createdAt.localeCompare(right.createdAt),
  );
}
export function decisionStatusForSkip(
  reason: SkippedUrl["reason"],
): EnqueueDecision["status"] {
  switch (reason) {
    case "INVALID_URL":
      return "invalid_url";
    case "UNSUPPORTED_PROTOCOL":
      return "rejected_protocol";
    case "SCOPE_REJECTED":
      return "rejected_scope";
    case "ROBOTS_DISALLOWED":
      return "rejected_robots";
    case "NETWORK_SAFETY_REJECTED":
      return "rejected_network_safety";
    case "MAX_DEPTH_EXCEEDED":
      return "max_depth";
    case "MAX_REQUESTS_EXCEEDED":
      return "queue_limit";
    case "MAX_QUEUE_SIZE_EXCEEDED":
      return "queue_limit";
    case "USER_EXCLUDE_PATTERN":
      return "user_rule";
    case "ASSET_SKIPPED":
      return "asset_skipped";
    case "DUPLICATE":
      return "duplicate";
    case "MAX_URL_LENGTH_EXCEEDED":
    case "MAX_PATH_SEGMENTS_EXCEEDED":
    case "MAX_QUERY_PARAMS_EXCEEDED":
    case "PATH_PATTERN_LIMIT_EXCEEDED":
    case "DIRECTORY_LIMIT_EXCEEDED":
    case "CONTENT_TYPE_EXCLUDED":
    case "RENDER_LIMIT_EXCEEDED":
    case "SITEMAP_LIMIT_EXCEEDED":
    case "DUPLICATE_BODY_PATTERN_LIMIT_EXCEEDED":
      return "trap_guard";
  }
}
