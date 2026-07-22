import type { XmlDocument } from "@ismail-elkorchi/xml-parser";
import type { ParserBudgetReport, ParserDiagnostic } from "../core/types.js";
import { nowIso } from "../core/utils.js";
import { xmlDiagnostics } from "./diagnostics.js";
import type { XmlResourceContext } from "./extraction-types.js";
import { extractFeedEntries } from "./feed.js";
import { extractSitemapEntries } from "./sitemap.js";
import type {
  CrawledXmlResource,
  FeedEntry,
  SitemapEntry,
  XmlParseStatus,
} from "./types.js";
import { classifyXmlRoot } from "./xml-classifier.js";
import { namespaces } from "./xml-dom.js";

export function extractXmlDocument(
  context: XmlResourceContext,
  document: XmlDocument,
): CrawledXmlResource {
  const root = document.root;
  if (root === null)
    return createXmlResource(
      context,
      document,
      "unknown-xml",
      [],
      [],
      xmlDiagnostics(document.errors),
      [],
      parseStatus(document),
      withinBudgets(context),
    );
  const kind = classifyXmlRoot(root);
  const sitemap =
    kind === "sitemap" || kind === "sitemap-index"
      ? extractSitemapEntries(context, root)
      : { entries: [], warnings: [] };
  const feedEntries = kind === "feed" ? extractFeedEntries(context, root) : [];
  return createXmlResource(
    context,
    document,
    kind,
    sitemap.entries,
    feedEntries,
    xmlDiagnostics(document.errors),
    sitemap.warnings,
    parseStatus(document),
    withinBudgets(context),
  );
}

export function failedXmlResource(
  context: XmlResourceContext,
  diagnostic: ParserDiagnostic,
  status: Exclude<
    XmlParseStatus,
    { readonly kind: "well-formed" | "malformed" }
  >,
): CrawledXmlResource {
  return createXmlResource(
    context,
    null,
    "unknown-xml",
    [],
    [],
    [diagnostic],
    [],
    status,
    status.kind === "budget-exceeded"
      ? {
          ...budgetLimits(context),
          status: "exceeded",
          budget: status.budget,
          limit: status.limit,
          actual: status.actual,
        }
      : withinBudgets(context),
  );
}

function createXmlResource(
  context: XmlResourceContext,
  document: XmlDocument | null,
  kind: CrawledXmlResource["xmlKind"],
  sitemapEntries: readonly SitemapEntry[],
  feedEntries: readonly FeedEntry[],
  parserDiagnostics: readonly ParserDiagnostic[],
  warnings: CrawledXmlResource["warnings"],
  parseStatusValue: XmlParseStatus,
  parserBudgets: ParserBudgetReport,
): CrawledXmlResource {
  const root = document?.root ?? null;
  return {
    schemaId: "site-crawler.xmlResource",
    schemaVersion: 1,
    runId: context.runId,
    requestId: context.requestId,
    resourceId: context.resourceId,
    requestedUrl: context.requestedUrl,
    finalUrl: context.finalUrl,
    normalizedUrl: context.normalizedUrl,
    xmlKind: kind,
    rootName: root?.qName ?? null,
    namespaces: root === null ? [] : namespaces(root),
    encoding: context.encoding,
    parseStatus: parseStatusValue,
    evidence: context.evidence ?? null,
    sitemapEntries,
    feedEntries,
    warnings: [...context.decodingWarnings, ...warnings],
    parserDiagnostics,
    parserBudgets,
    extractedAt: nowIso(),
  };
}

function parseStatus(document: XmlDocument): XmlParseStatus {
  return document.errors.length === 0
    ? { kind: "well-formed" }
    : { kind: "malformed", errorCount: document.errors.length };
}

function budgetLimits(context: XmlResourceContext) {
  return {
    maxInputBytes: context.config.parsing.xml.maxStreamBytes,
    maxNodes: context.config.parsing.xml.maxNodes,
    maxDepth: context.config.parsing.xml.maxDepth,
    maxTextBytes: context.config.parsing.xml.maxTextBytes,
  };
}

function withinBudgets(context: XmlResourceContext): ParserBudgetReport {
  return { ...budgetLimits(context), status: "within-limits" };
}
