import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import { BodyCollector, BodyLimitError } from "../http/body-collector.js";
import type { ResponseBody } from "../http/body-types.js";
import {
  nodeReadableFromWeb,
  responseBodyPrefix,
  responseBodyStream,
} from "../http/body.js";
import type { ResponseLimits } from "../http/types.js";

export interface PreparedXmlBody {
  readonly body: ResponseBody | null;
  readonly error: CrawlError | null;
  readonly wasCompressed: boolean;
}

export async function prepareXmlBody(
  body: ResponseBody,
  limits: ResponseLimits,
  url: string,
  requestId: string,
  signal: AbortSignal,
): Promise<PreparedXmlBody> {
  const prefix = await responseBodyPrefix(body, 2);
  if (!isGzip(prefix)) return { body, error: null, wasCompressed: false };
  const collector = new BodyCollector(
    limits.maxDecompressedBytes,
    limits.memoryThresholdBytes,
    limits.spoolDirectory,
    `${requestId}-xml-gzip`,
  );
  try {
    await pipeline(
      nodeReadableFromWeb(responseBodyStream(body)),
      createGunzip(),
      collector,
      { signal },
    );
    return { body: collector.body(), error: null, wasCompressed: true };
  } catch (caught) {
    await collector.discard();
    return {
      body: null,
      error: decompressionError(caught, url, requestId, signal),
      wasCompressed: true,
    };
  }
}

function decompressionError(
  caught: unknown,
  url: string,
  requestId: string,
  signal: AbortSignal,
): CrawlError {
  if (caught instanceof BodyLimitError)
    return crawlError({
      code: "XML_BUDGET_EXCEEDED",
      message: caught.message,
      url,
      requestId,
      cause: caught,
    });
  if (signal.aborted)
    return crawlError({
      code: "FETCH_ABORTED",
      message: "XML gzip decompression was aborted",
      url,
      requestId,
      cause: caught,
    });
  return crawlError({
    code: "XML_PARSE_ERROR",
    message: "Malformed gzip-compressed XML payload",
    url,
    requestId,
    cause: caught,
  });
}

function isGzip(body: Uint8Array): boolean {
  return body[0] === 0x1f && body[1] === 0x8b;
}
