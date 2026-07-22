import { gunzip } from "node:zlib";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";

interface XmlDecompressionResult {
  readonly bytes: Uint8Array | null;
  readonly error: CrawlError | null;
  readonly wasCompressed: boolean;
}

export async function decompressXmlPayload(
  body: Uint8Array,
  maxOutputBytes: number,
  url: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<XmlDecompressionResult> {
  if (!isGzip(body)) return { bytes: body, error: null, wasCompressed: false };
  if (signal?.aborted === true)
    return abortedResult(url, requestId, signal.reason);

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result: XmlDecompressionResult): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish(abortedResult(url, requestId, signal?.reason));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    gunzip(body, { maxOutputLength: maxOutputBytes }, (error, output) => {
      if (error !== null) {
        finish(decompressionFailure(error, maxOutputBytes, url, requestId));
        return;
      }
      finish({ bytes: output, error: null, wasCompressed: true });
    });
  });
}

function decompressionFailure(
  error: Error,
  maxOutputBytes: number,
  url: string,
  requestId: string,
): XmlDecompressionResult {
  if (isOutputLimitError(error)) {
    return {
      bytes: null,
      error: crawlError({
        code: "XML_BUDGET_EXCEEDED",
        message: `Decompressed XML exceeds ${maxOutputBytes} bytes.`,
        url,
        requestId,
        cause: error,
      }),
      wasCompressed: true,
    };
  }
  return {
    bytes: null,
    error: crawlError({
      code: "XML_PARSE_ERROR",
      message: "Malformed gzip-compressed XML payload",
      url,
      requestId,
      cause: error,
    }),
    wasCompressed: true,
  };
}

function abortedResult(
  url: string,
  requestId: string,
  cause: unknown,
): XmlDecompressionResult {
  return {
    bytes: null,
    error: crawlError({
      code: "FETCH_ABORTED",
      message: "XML gzip decompression was aborted",
      url,
      requestId,
      cause,
    }),
    wasCompressed: true,
  };
}

function isOutputLimitError(error: Error): boolean {
  return (
    ("code" in error && error.code === "ERR_BUFFER_TOO_LARGE") ||
    error.message.includes("maxOutputLength") ||
    error.message.includes("larger than")
  );
}

function isGzip(body: Uint8Array): boolean {
  return body[0] === 0x1f && body[1] === 0x8b;
}
