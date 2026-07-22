import {
  parseXml,
  XmlBudgetExceededError,
  XmlConfigurationError,
} from "@ismail-elkorchi/xml-parser";
import type { ParserDiagnostic } from "../core/types.js";
import { extractXmlDocument, failedXmlResource } from "./document-extractor.js";
import type { XmlExtractionInput } from "./extraction-types.js";
import type { CrawledXmlResource } from "./types.js";

export function extractXmlResource(
  input: XmlExtractionInput,
): CrawledXmlResource {
  try {
    const document = parseXml(input.xml, {
      budgets: {
        maxInputBytes: input.config.parsing.xml.maxStreamBytes,
        maxStreamBytes: input.config.parsing.xml.maxStreamBytes,
        maxNodes: input.config.parsing.xml.maxNodes,
        maxDepth: input.config.parsing.xml.maxDepth,
        maxTextBytes: input.config.parsing.xml.maxTextBytes,
      },
    });
    return extractXmlDocument(input, document);
  } catch (caught) {
    if (caught instanceof XmlBudgetExceededError) {
      return failedXmlResource(
        input,
        diagnostic("XML_BUDGET_EXCEEDED", caught),
        {
          kind: "budget-exceeded",
          budget: caught.budget,
          limit: caught.limit,
          actual: caught.actual,
        },
      );
    }
    if (caught instanceof XmlConfigurationError) {
      return failedXmlResource(
        input,
        diagnostic("XML_CONFIGURATION_ERROR", caught),
        {
          kind: "configuration-failed",
          code: caught.code,
          path: caught.path,
        },
      );
    }
    throw caught;
  }
}

function diagnostic(code: string, error: Error): ParserDiagnostic {
  return {
    level: "error",
    code,
    message: error.message,
    position: null,
  };
}
