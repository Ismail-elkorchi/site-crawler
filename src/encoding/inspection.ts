import { createHash } from "node:crypto";
import { warning } from "../diagnostics/factory.js";
import type { CrawlWarning } from "../diagnostics/types.js";
import type { ResponseBody } from "../http/body-types.js";
import { responseBodyPrefix, responseBodyStream } from "../http/body.js";
import type { BodyHash } from "../resources/types.js";
import { detectEncoding, type EncodingKind } from "./detection.js";
import { selectDecoder } from "./decoder.js";
import type { EncodingFact } from "./types.js";

export interface TextBodyInspection {
  readonly encoding: EncodingFact;
  readonly warnings: readonly CrawlWarning[];
  readonly bodyHash: BodyHash | null;
}

export async function inspectTextBody(
  body: ResponseBody,
  contentType: string | null,
  kind: EncodingKind,
  hashBodies: boolean,
): Promise<TextBodyInspection> {
  const prefix = await responseBodyPrefix(body, kind === "html" ? 1024 : 512);
  const selection = selectDecoder(detectEncoding(prefix, contentType, kind), {
    kind: "replacement",
  });
  const rawHash = hashBodies ? createHash("sha256") : null;
  const decodedHash = hashBodies ? createHash("sha256") : null;
  const reader = responseBodyStream(body).getReader();
  let hadReplacementChars = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      rawHash?.update(result.value);
      const text = selection.decoder.decode(result.value, { stream: true });
      if (text.includes("\uFFFD")) hadReplacementChars = true;
      decodedHash?.update(text, "utf8");
    }
    const tail = selection.decoder.decode();
    if (tail.includes("\uFFFD")) hadReplacementChars = true;
    decodedHash?.update(tail, "utf8");
  } finally {
    reader.releaseLock();
  }
  const warnings = [...selection.warnings];
  if (hadReplacementChars)
    warnings.push(
      warning(
        "DECODE_WARNING",
        `${kind} body used replacement characters during ${selection.encoding} decoding.`,
      ),
    );
  return {
    encoding: {
      encoding: selection.encoding,
      source: selection.source,
      hadReplacementChars,
    },
    warnings,
    bodyHash:
      rawHash === null || decodedHash === null
        ? null
        : {
            rawSha256: rawHash.digest("hex"),
            decodedSha256: decodedHash.digest("hex"),
          },
  };
}

export async function hashBinaryBody(
  body: ResponseBody,
  enabled: boolean,
): Promise<BodyHash | null> {
  if (!enabled) return null;
  const hash = createHash("sha256");
  const reader = responseBodyStream(body).getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      hash.update(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return { rawSha256: hash.digest("hex"), decodedSha256: null };
}
