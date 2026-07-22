import { shouldEnqueueNavigationUrl } from "../classification/index.js";
import type {
  EnqueueDecision,
  ExtractedLink,
  LinkEdge,
} from "../links/types.js";
import { createLinkEdge } from "../links/factory.js";
import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
import type { ResultStore } from "../storage/index.js";
import type { ScopePolicy } from "../url/index.js";
import { normalizeUrl } from "../url/index.js";
import type { NormalizedUrl } from "../url/types.js";
import type { ResolvedCrawlConfig } from "../config/types.js";
export interface HtmlLinkProcessingResult {
  readonly edges: readonly LinkEdge[];
  readonly discovered: number;
  readonly truncated: number;
  readonly inScopeOutgoing: number;
  readonly outOfScopeOutgoing: number;
}
export interface HtmlLinkProcessorDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly store: ResultStore;
  readonly scope: ScopePolicy;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: "html-link" | "javascript-static" | "css-static",
    depth: number,
    seed: ResolvedSeed,
  ): Promise<EnqueueDecision>;
}
export class HtmlLinkProcessor {
  private readonly deps: HtmlLinkProcessorDependencies;
  public constructor(deps: HtmlLinkProcessorDependencies) {
    this.deps = deps;
  }
  public async processLinks(
    links: readonly ExtractedLink[],
    finalUrl: string,
    request: CrawlRequest,
    seed: ResolvedSeed | null,
  ): Promise<HtmlLinkProcessingResult> {
    let inScopeOutgoing = 0;
    let outOfScopeOutgoing = 0;
    const edges: LinkEdge[] = [];
    const candidates = validHtmlLinkCandidates(links, finalUrl);
    const selected = candidates.slice(
      0,
      this.deps.config.limits.maxDiscoveredLinksPerPage,
    );
    for (const { link, normalized } of selected) {
      const decision =
        seed === null
          ? ({
              status: "rejected_scope",
              reason: "No seed available",
              requestId: null,
            } satisfies EnqueueDecision)
          : await this.decisionForLink(
              link,
              normalized,
              finalUrl,
              request,
              seed,
            );
      if (
        this.deps.scope.decide(
          normalized.normalizedUrl,
          request.depth + 1,
          seed?.normalizedUrl ?? null,
        ).allowed
      )
        inScopeOutgoing += 1;
      else outOfScopeOutgoing += 1;
      const edge = createLinkEdge({
        runId: this.deps.runId,
        fromUrl: finalUrl,
        raw: link.raw,
        source: link.source,
        kind: link.kind,
        anchorText: link.anchorText,
        rel: link.rel,
        target: link.target,
        depth: request.depth + 1,
        evidence: link.evidence,
        enqueueDecision: decision,
      });
      edges.push(edge);
      await this.deps.store.writeLink(edge);
    }
    return {
      edges,
      discovered: candidates.length,
      truncated: Math.max(0, candidates.length - edges.length),
      inScopeOutgoing,
      outOfScopeOutgoing,
    };
  }
  private async decisionForLink(
    link: ExtractedLink,
    normalized: NormalizedUrl,
    finalUrl: string,
    request: CrawlRequest,
    seed: ResolvedSeed,
  ): Promise<EnqueueDecision> {
    const linkDepth = request.depth + 1;
    const scope = this.deps.scope.decide(
      normalized.normalizedUrl,
      linkDepth,
      seed.normalizedUrl,
    );
    if (!scope.allowed)
      return {
        status: "rejected_scope",
        reason: scope.reason,
        requestId: null,
      };
    const shouldFetchScript =
      this.deps.config.jsDiscovery.enabled &&
      this.deps.config.jsDiscovery.fetchScriptAssets &&
      link.kind === "script";
    const shouldFetchStylesheet =
      this.deps.config.cssDiscovery.enabled &&
      this.deps.config.cssDiscovery.fetchStylesheets &&
      link.kind === "stylesheet";
    const shouldEnqueueCssDiscovery =
      this.deps.config.cssDiscovery.enabled &&
      this.deps.config.cssDiscovery.enqueueDiscoveredUrls &&
      link.evidence.kind === "css";
    const isNavigation =
      link.kind === "navigation" &&
      shouldEnqueueNavigationUrl(normalized.normalizedUrl);
    if (
      isNavigation ||
      shouldFetchScript ||
      shouldFetchStylesheet ||
      shouldEnqueueCssDiscovery
    ) {
      const source = shouldFetchScript
        ? "javascript-static"
        : shouldFetchStylesheet || shouldEnqueueCssDiscovery
          ? "css-static"
          : "html-link";
      return await this.deps.enqueue(
        normalized.normalizedUrl,
        finalUrl,
        source,
        linkDepth,
        seed,
      );
    }
    return {
      status: "asset_skipped",
      reason: "Non-navigation link",
      requestId: null,
    };
  }
}

interface ValidHtmlLinkCandidate {
  readonly link: ExtractedLink;
  readonly normalized: NormalizedUrl;
}

export function validHtmlLinkCandidates(
  links: readonly ExtractedLink[],
  finalUrl: string,
): readonly ValidHtmlLinkCandidate[] {
  return links.flatMap((link) => {
    const normalized = normalizeUrl(link.raw, finalUrl);
    return normalized.ok ? [{ link, normalized: normalized.value }] : [];
  });
}
