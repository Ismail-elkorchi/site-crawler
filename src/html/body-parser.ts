import { parseStream } from "@ismail-elkorchi/html-parser";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { EncodingFact } from "../encoding/types.js";
import type { ResponseBody } from "../http/body-types.js";
import { responseBodyStream } from "../http/body.js";
import { extractHtmlTreeFacts } from "./tree-extractor.js";
import type { HtmlExtractionResult } from "./types.js";

export async function extractHtmlBodyFacts(
  body: ResponseBody,
  finalUrl: string,
  config: ResolvedCrawlConfig,
  encoding: EncodingFact | null,
  xRobotsTag: string | null,
): Promise<HtmlExtractionResult> {
  const tree = await parseStream(responseBodyStream(body), {
    captureSpans: true,
    ...(encoding === null ? {} : { transportEncodingLabel: encoding.encoding }),
    budgets: {
      maxInputBytes: config.parsing.html.maxInputBytes,
      maxDecodedUtf8Bytes: Math.min(
        Number.MAX_SAFE_INTEGER,
        config.parsing.html.maxInputBytes * 3,
      ),
      maxNodes: config.parsing.html.maxNodes,
      maxDepth: config.parsing.html.maxDepth,
    },
  });
  return extractHtmlTreeFacts(tree.tree, finalUrl, config, {
    encoding,
    xRobotsTag,
  });
}
