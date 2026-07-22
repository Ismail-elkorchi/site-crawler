import type { ResolvedCrawlConfig } from "../config/types.js";
import type { EncodingFact } from "../encoding/types.js";
import type { EvidenceReference } from "../evidence/types.js";
import type { CrawlWarning } from "../diagnostics/types.js";

export interface XmlResourceContext {
  readonly runId: string;
  readonly requestId: string;
  readonly resourceId: string;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly normalizedUrl: string;
  readonly encoding: EncodingFact | null;
  readonly evidence?: EvidenceReference | null;
  readonly decodingWarnings: readonly CrawlWarning[];
  readonly config: ResolvedCrawlConfig;
}

export interface XmlExtractionInput extends XmlResourceContext {
  readonly xml: string;
}
