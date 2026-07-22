import { nowIso } from "../core/utils.js";
import { warning } from "../diagnostics/factory.js";
import type { EvidenceReference } from "../evidence/types.js";
import type { CrawlRequest } from "../requests/types.js";
import type { HtmlExtractionResult } from "./extractor.js";
import type { HtmlLinkProcessingResult } from "./link-decider.js";
import type { CrawledHtmlPage, HtmlPageFacts } from "./types.js";

export interface HtmlPageRecordInput {
  readonly runId: string;
  readonly extraction: HtmlExtractionResult;
  readonly links: HtmlLinkProcessingResult;
  readonly request: CrawlRequest;
  readonly resourceId: string;
  readonly finalUrl: string;
  readonly htmlSource: CrawledHtmlPage["htmlSource"];
  readonly evidence: EvidenceReference | null;
}

export function createHtmlPage(input: HtmlPageRecordInput): CrawledHtmlPage {
  return {
    schemaId: "site-crawler.htmlPage",
    schemaVersion: 1,
    runId: input.runId,
    requestId: input.request.id,
    resourceId: input.resourceId,
    requestedUrl: input.request.normalizedUrl,
    finalUrl: input.finalUrl,
    normalizedUrl: input.request.normalizedUrl,
    depth: input.request.depth,
    discoveredFrom: input.request.referrerUrl,
    discoveredBy: input.request.source,
    htmlSource: input.htmlSource,
    evidence: input.evidence,
    facts: addLinkTruncationWarning(
      input.extraction.facts,
      input.links.truncated,
    ),
    discoveredOutgoingLinkCount: input.links.discovered,
    recordedOutgoingLinkCount: input.links.edges.length,
    truncatedOutgoingLinkCount: input.links.truncated,
    inScopeOutgoingLinkCount: input.links.inScopeOutgoing,
    outOfScopeOutgoingLinkCount: input.links.outOfScopeOutgoing,
    extractedAt: nowIso(),
  };
}

export function addLinkTruncationWarning(
  facts: HtmlPageFacts,
  truncated: number,
): HtmlPageFacts {
  if (truncated === 0) return facts;
  return {
    ...facts,
    warnings: [
      ...facts.warnings,
      warning(
        "LINK_LIMIT_REACHED",
        "Page link records were truncated by the configured limit",
        `${truncated} links were not recorded`,
      ),
    ],
  };
}
