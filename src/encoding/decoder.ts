import { warning } from "../diagnostics/factory.js";
import type { CrawlWarning } from "../diagnostics/types.js";
import type { EncodingDetection } from "./detection.js";

export interface DecoderSelection {
  readonly decoder: TextDecoder;
  readonly encoding: string;
  readonly source: EncodingDetection["source"];
  readonly warnings: readonly CrawlWarning[];
}

export type DecodingPolicy =
  { readonly kind: "replacement" } | { readonly kind: "fatal" };

export class TextDecodingError extends Error {
  public override readonly name = "TextDecodingError";
  public readonly code: "UNSUPPORTED_ENCODING" | "INVALID_ENCODED_TEXT";
  public readonly encoding: string;

  public constructor(
    code: TextDecodingError["code"],
    encoding: string,
    cause?: unknown,
  ) {
    super(
      code === "UNSUPPORTED_ENCODING"
        ? `Unsupported text encoding '${encoding}'.`
        : `Input is not valid ${encoding} text.`,
      { cause },
    );
    this.code = code;
    this.encoding = encoding;
  }
}

export function selectDecoder(
  detection: EncodingDetection,
  policy: DecodingPolicy,
): DecoderSelection {
  try {
    return {
      decoder: new TextDecoder(detection.encoding, {
        fatal: policy.kind === "fatal",
      }),
      encoding: detection.encoding,
      source: detection.source,
      warnings: [],
    };
  } catch (caught) {
    if (policy.kind === "fatal") {
      throw new TextDecodingError(
        "UNSUPPORTED_ENCODING",
        detection.encoding,
        caught,
      );
    }
    return {
      decoder: new TextDecoder("utf-8", { fatal: false }),
      encoding: "utf-8",
      source: "fallback",
      warnings: [
        warning(
          "DECODE_WARNING",
          `Unsupported charset '${detection.encoding}'; UTF-8 fallback applied.`,
        ),
      ],
    };
  }
}
