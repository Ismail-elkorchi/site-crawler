import {
  TEXT_CONTENT_POLICY,
  VISIBLE_TEXT_HTML_POLICY,
  extractText,
  type DocumentTree,
  type FragmentTree,
  type HtmlNode,
  type TextExtractionResult,
} from "@ismail-elkorchi/html-parser";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { TextExtractionFact } from "./types.js";

type TextSource = DocumentTree | FragmentTree | HtmlNode;

export interface HtmlTextReader {
  readonly completeText: (source: TextSource) => string;
  readonly documentText: (tree: DocumentTree) => TextExtractionFact;
  readonly visibleText: (tree: DocumentTree) => TextExtractionFact;
}

function toFact(result: TextExtractionResult): TextExtractionFact {
  return {
    text: result.text,
    totalBytes: result.totalBytes,
    truncated: result.truncated,
  };
}

export function createHtmlTextReader(
  config: ResolvedCrawlConfig,
): HtmlTextReader {
  const { maxInputBytes, maxNodes, maxTextBytes } = config.parsing.html;
  const completeOutputBytes = Math.min(
    Number.MAX_SAFE_INTEGER,
    maxInputBytes * 3,
  );

  return {
    completeText(source): string {
      const result = extractText(source, {
        policy: TEXT_CONTENT_POLICY,
        maxOutputBytes: completeOutputBytes,
        maxTokens: maxNodes,
      });
      if (result.truncated) {
        throw new Error(
          `Complete HTML text exceeded parser-derived bounds (${String(result.totalBytes)} UTF-8 bytes)`,
        );
      }
      return result.text;
    },
    documentText(tree): TextExtractionFact {
      return toFact(
        extractText(tree, {
          policy: TEXT_CONTENT_POLICY,
          maxOutputBytes: maxTextBytes,
          maxTokens: maxNodes,
        }),
      );
    },
    visibleText(tree): TextExtractionFact {
      return toFact(
        extractText(tree, {
          policy: VISIBLE_TEXT_HTML_POLICY,
          maxOutputBytes: maxTextBytes,
          maxTokens: Math.min(Number.MAX_SAFE_INTEGER, maxNodes * 2),
          maxFallbackInputBytes: maxInputBytes,
          maxFallbackNodes: maxNodes,
          trim: true,
        }),
      );
    },
  };
}
