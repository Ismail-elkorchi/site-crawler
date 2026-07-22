import type { ParserBudgetReport, ParserDiagnostic } from "../core/types.js";
import type { CrawlWarning } from "../diagnostics/types.js";
import type { EncodingFact } from "../encoding/types.js";
import type { EvidenceReference } from "../evidence/types.js";
import type {
  XmlConfigurationErrorCode,
  XmlParseBudgets,
} from "@ismail-elkorchi/xml-parser";
export interface XmlNamespaceFact {
  readonly prefix: string | null;
  readonly uri: string;
}
export type SitemapEntryKind = "url" | "sitemap";
export type SitemapChangeFrequency =
  "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export interface SitemapEntry {
  readonly schemaId: "site-crawler.sitemapEntry";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly sitemapUrl: string;
  readonly entryKind: SitemapEntryKind;
  readonly rawLoc: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly lastmod: string | null;
  readonly changefreq: SitemapChangeFrequency | null;
  readonly priority: number | null;
  readonly warnings: readonly CrawlWarning[];
  readonly discoveredAt: string;
}
export interface FeedEntry {
  readonly schemaId: "site-crawler.feedEntry";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly feedUrl: string;
  readonly rawUrl: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly title: string | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
  readonly discoveredAt: string;
}
export type XmlParseStatus =
  | { readonly kind: "well-formed" }
  | { readonly kind: "malformed"; readonly errorCount: number }
  | {
      readonly kind: "budget-exceeded";
      readonly budget: keyof XmlParseBudgets;
      readonly limit: number;
      readonly actual: number;
    }
  | {
      readonly kind: "decoding-failed";
      readonly code: "UNSUPPORTED_ENCODING" | "INVALID_ENCODED_TEXT";
      readonly encoding: string;
    }
  | {
      readonly kind: "configuration-failed";
      readonly code: XmlConfigurationErrorCode;
      readonly path: string;
    }
  | { readonly kind: "aborted"; readonly reason: string };
export interface CrawledXmlResource {
  readonly schemaId: "site-crawler.xmlResource";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly requestId: string;
  readonly resourceId: string;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly normalizedUrl: string;
  readonly xmlKind:
    "sitemap" | "sitemap-index" | "feed" | "generic-xml" | "unknown-xml";
  readonly rootName: string | null;
  readonly namespaces: readonly XmlNamespaceFact[];
  readonly encoding: EncodingFact | null;
  readonly parseStatus: XmlParseStatus;
  readonly evidence: EvidenceReference | null;
  readonly sitemapEntries: readonly SitemapEntry[];
  readonly feedEntries: readonly FeedEntry[];
  readonly warnings: readonly CrawlWarning[];
  readonly parserDiagnostics: readonly ParserDiagnostic[];
  readonly parserBudgets: ParserBudgetReport;
  readonly extractedAt: string;
}
