import { isHtmlLike, isXmlLike } from "../classification/index.js";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlWarning } from "../diagnostics/types.js";
import {
  hashBinaryBody,
  inspectTextBody,
  type EncodingKind,
} from "../encoding/index.js";
import type { EncodingFact } from "../encoding/types.js";
import type { ResponseBody } from "../http/body-types.js";
import type { BodyHash, ResourceType } from "./types.js";

export interface PayloadInspection {
  readonly encoding: EncodingFact | null;
  readonly warnings: readonly CrawlWarning[];
  readonly bodyHash: BodyHash | null;
}

export async function inspectPayload(
  original: ResponseBody | null,
  payload: ResponseBody | null,
  resourceType: ResourceType,
  contentType: string | null,
  config: ResolvedCrawlConfig,
): Promise<PayloadInspection> {
  if (payload === null) return { encoding: null, warnings: [], bodyHash: null };
  if (!shouldDecode(resourceType)) {
    return {
      encoding: null,
      warnings: [],
      bodyHash: await hashBinaryBody(payload, config.output.hashBodies),
    };
  }
  const inspected = await inspectTextBody(
    payload,
    contentType,
    decodeKind(resourceType),
    config.output.hashBodies,
  );
  if (original === null || original === payload)
    return {
      encoding: inspected.encoding,
      warnings: inspected.warnings,
      bodyHash: inspected.bodyHash,
    };
  const originalHash = await hashBinaryBody(original, config.output.hashBodies);
  return {
    encoding: inspected.encoding,
    warnings: inspected.warnings,
    bodyHash:
      originalHash === null || inspected.bodyHash === null
        ? null
        : {
            rawSha256: originalHash.rawSha256,
            decodedSha256: inspected.bodyHash.decodedSha256,
          },
  };
}

function shouldDecode(resourceType: ResourceType): boolean {
  return (
    isHtmlLike(resourceType) ||
    isXmlLike(resourceType) ||
    resourceType === "json" ||
    resourceType === "text" ||
    resourceType === "javascript" ||
    resourceType === "css"
  );
}

function decodeKind(resourceType: ResourceType): EncodingKind {
  if (isXmlLike(resourceType)) return "xml";
  if (isHtmlLike(resourceType)) return "html";
  return "text";
}
