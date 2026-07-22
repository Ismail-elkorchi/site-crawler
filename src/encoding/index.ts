import { warning } from "../diagnostics/factory.js";
import type { CrawlWarning } from "../diagnostics/types.js";
import { detectEncoding, type EncodingKind } from "./detection.js";
import {
  selectDecoder,
  TextDecodingError,
  type DecodingPolicy,
} from "./decoder.js";
import type { EncodingFact } from "./types.js";

export interface DecodedBody {
  readonly text: string;
  readonly encoding: EncodingFact;
  readonly warnings: readonly CrawlWarning[];
}

export function decodeBody(
  body: Uint8Array,
  contentType: string | null,
  kind: EncodingKind,
  policy: DecodingPolicy,
): DecodedBody {
  const selection = selectDecoder(
    detectEncoding(body, contentType, kind),
    policy,
  );
  let text: string;
  try {
    text = selection.decoder.decode(body);
  } catch (caught) {
    throw new TextDecodingError(
      "INVALID_ENCODED_TEXT",
      selection.encoding,
      caught,
    );
  }
  const hadReplacementChars = text.includes("\uFFFD");
  const warnings = [...selection.warnings];
  if (hadReplacementChars)
    warnings.push(
      warning(
        "DECODE_WARNING",
        `${kind} body used replacement characters during ${selection.encoding} decoding.`,
      ),
    );
  return {
    text,
    encoding: {
      encoding: selection.encoding,
      source: selection.source,
      hadReplacementChars,
    },
    warnings,
  };
}

export { detectEncoding } from "./detection.js";
export { inspectTextBody, hashBinaryBody } from "./inspection.js";
export type { EncodingKind, EncodingDetection } from "./detection.js";
export { TextDecodingError } from "./decoder.js";
export type { DecodingPolicy } from "./decoder.js";
export type * from "./types.js";
