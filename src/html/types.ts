import type {
  SourcePosition,
  ParserBudgetReport,
  ParserDiagnostic,
} from "../core/types.js";
import type { EncodingFact } from "../encoding/types.js";
import type { EvidenceReference } from "../evidence/types.js";
import type { CrawlSource } from "../requests/types.js";
export interface RobotsHeaderFact {
  readonly raw: string;
  readonly agent: string | null;
  readonly directives: readonly string[];
}
export interface TextFact {
  readonly raw: string;
  readonly value: string;
  readonly sourcePath: string | null;
  readonly position: SourcePosition | null;
}
export interface MetaFact {
  readonly name: string | null;
  readonly property: string | null;
  readonly httpEquiv: string | null;
  readonly content: string | null;
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface LinkFact {
  readonly rawHref: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly rel: readonly string[];
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface HreflangFact extends LinkFact {
  readonly hreflang: string | null;
}
export interface HeadingFact {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly rawHtml: string | null;
  readonly id: string | null;
  readonly position: SourcePosition | null;
}
export interface AnchorFact {
  readonly rawHref: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly text: string;
  readonly rel: readonly string[];
  readonly target: string | null;
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface ImageFact {
  readonly rawSrc: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly alt: string | null;
  readonly srcset: readonly string[];
  readonly loading: string | null;
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface HtmlResourceReferenceFact {
  readonly elementName: string;
  readonly attributeName: string;
  readonly rawUrl: string;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly kind: import("../links/types.js").LinkKind;
  readonly position: SourcePosition | null;
}
export interface IframeFact {
  readonly rawSrc: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface ScriptFact {
  readonly rawSrc: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly type: string | null;
  readonly text: string | null;
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface FormFact {
  readonly method: string | null;
  readonly rawAction: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface MetaRefreshFact {
  readonly content: string;
  readonly seconds: number | null;
  readonly rawUrl: string | null;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
}
export interface JsonLdBlockFact {
  readonly text: string;
  readonly rawAttributes: Readonly<Record<string, string>>;
  readonly position: SourcePosition | null;
}
export interface MicrodataFact {
  readonly itemtype: string | null;
  readonly itemprop: string | null;
  readonly itemscope: boolean;
  readonly position: SourcePosition | null;
}
export interface TextExtractionFact {
  readonly text: string;
  readonly totalBytes: number;
  readonly truncated: boolean;
}
export interface OutlineEntryFact {
  readonly depth: number;
  readonly tagName: string;
  readonly text: string;
}
export interface OutlineFact {
  readonly entries: readonly OutlineEntryFact[];
}
export interface HtmlPageFacts {
  readonly schemaId: "site-crawler.htmlPageFacts";
  readonly schemaVersion: 1;
  readonly title: TextFact | null;
  readonly titles: readonly TextFact[];
  readonly metaDescription: TextFact | null;
  readonly metaRobots: readonly MetaFact[];
  readonly xRobotsTag: readonly RobotsHeaderFact[];
  readonly metaTags: readonly MetaFact[];
  readonly canonical: LinkFact | null;
  readonly alternates: readonly LinkFact[];
  readonly hreflang: readonly HreflangFact[];
  readonly baseHref: LinkFact | null;
  readonly htmlLang: string | null;
  readonly charset: EncodingFact | null;
  readonly viewport: TextFact | null;
  readonly headings: readonly HeadingFact[];
  readonly anchors: readonly AnchorFact[];
  readonly areas: readonly AnchorFact[];
  readonly images: readonly ImageFact[];
  readonly iframes: readonly IframeFact[];
  readonly scripts: readonly ScriptFact[];
  readonly stylesheets: readonly LinkFact[];
  readonly forms: readonly FormFact[];
  readonly resourceReferences: readonly HtmlResourceReferenceFact[];
  readonly metaRefresh: MetaRefreshFact | null;
  readonly openGraph: readonly MetaFact[];
  readonly socialMeta: readonly MetaFact[];
  readonly jsonLdBlocks: readonly JsonLdBlockFact[];
  readonly microdata: readonly MicrodataFact[];
  readonly visibleText: TextExtractionFact;
  readonly textContent: TextExtractionFact;
  readonly outline: OutlineFact;
  readonly warnings: readonly import("../diagnostics/types.js").CrawlWarning[];
  readonly parserDiagnostics: readonly ParserDiagnostic[];
  readonly parserBudgets: ParserBudgetReport;
}
export interface HtmlExtractionContext {
  readonly encoding?: EncodingFact | null;
  readonly xRobotsTag?: string | null;
}

export interface HtmlExtractionResult {
  readonly facts: HtmlPageFacts;
  readonly links: readonly import("../links/types.js").ExtractedLink[];
}

export interface CrawledHtmlPage {
  readonly schemaId: "site-crawler.htmlPage";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly requestId: string;
  readonly resourceId: string;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly normalizedUrl: string;
  readonly depth: number;
  readonly discoveredFrom: string | null;
  readonly discoveredBy: CrawlSource;
  readonly htmlSource: "http" | "rendered";
  readonly evidence: EvidenceReference | null;
  readonly facts: HtmlPageFacts;
  readonly discoveredOutgoingLinkCount: number;
  readonly recordedOutgoingLinkCount: number;
  readonly truncatedOutgoingLinkCount: number;
  readonly inScopeOutgoingLinkCount: number;
  readonly outOfScopeOutgoingLinkCount: number;
  readonly extractedAt: string;
}
