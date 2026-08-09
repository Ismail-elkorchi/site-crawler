import {
  collectResponseBody,
  ResponseBodyCollectionLimitError,
  responseBodyPrefix,
  responseBodyStream,
  type ResponseBody,
} from "@ismail-elkorchi/http-client";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
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
  try {
    const decoded = await collectResponseBody(
      responseBodyStream(body)
        .pipeThrough(
          new TransformStream<Uint8Array, BufferSource>({
            transform(chunk, controller) {
              const copied = new Uint8Array(chunk.byteLength);
              copied.set(chunk);
              controller.enqueue(copied);
            },
          }),
        )
        .pipeThrough(new DecompressionStream("gzip")),
      {
        maxBytes: limits.maxDecodedBytes,
        storage: {
          memoryThresholdBytes: limits.memoryThresholdBytes,
          spoolDirectory: limits.spoolDirectory,
        },
        signal,
      },
    );
    return { body: decoded, error: null, wasCompressed: true };
  } catch (caught) {
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
  if (caught instanceof ResponseBodyCollectionLimitError) {
    return crawlError({
      code: "XML_BUDGET_EXCEEDED",
      message: caught.message,
      url,
      requestId,
      cause: caught,
    });
  }
  if (signal.aborted) {
    return crawlError({
      code: "FETCH_ABORTED",
      message: "XML gzip decompression was aborted",
      url,
      requestId,
      cause: caught,
    });
  }
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
