import {
  PassThrough,
  Transform,
  type Duplex,
  type Readable,
  type TransformCallback,
} from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import { BodyCollector, BodyLimitError } from "./body-collector.js";
import type { ResponseBody } from "./body-types.js";
import type { ResponseLimits } from "./types.js";

export interface BodyReadResult {
  readonly body: ResponseBody | null;
  readonly wireBytesRead: number;
  readonly decodedBytesRead: number;
  readonly error: CrawlError | null;
}

export async function readBody(
  source: Readable,
  contentEncoding: string | string[] | undefined,
  limits: ResponseLimits,
  url: string,
  requestId: string,
  signal: AbortSignal,
): Promise<BodyReadResult> {
  const wire = new WireLimitTransform(limits.maxCompressedBytes);
  const collector = new BodyCollector(
    limits.maxDecompressedBytes,
    limits.memoryThresholdBytes,
    limits.spoolDirectory,
    requestId,
  );
  let decoder: Duplex;
  try {
    decoder = decoderFor(contentEncoding);
  } catch (caught) {
    source.destroy();
    return failure(
      "UNSUPPORTED_CONTENT_ENCODING",
      "Unsupported HTTP content encoding",
      url,
      requestId,
      caught,
      0,
      0,
    );
  }

  try {
    await pipeline(source, wire, decoder, collector, { signal });
    return {
      body: collector.body(),
      wireBytesRead: wire.bytesRead,
      decodedBytesRead: collector.bytesRead,
      error: null,
    };
  } catch (caught) {
    await collector.discard();
    if (caught instanceof BodyLimitError) {
      const code =
        caught.kind === "compressed"
          ? "RESPONSE_TOO_LARGE"
          : "DECOMPRESSED_RESPONSE_TOO_LARGE";
      return failure(
        code,
        caught.message,
        url,
        requestId,
        caught,
        wire.bytesRead,
        collector.bytesRead,
      );
    }
    if (signal.aborted) {
      return failure(
        "FETCH_ABORTED",
        "Request body reading was aborted",
        url,
        requestId,
        caught,
        wire.bytesRead,
        collector.bytesRead,
      );
    }
    return failure(
      "FETCH_DECOMPRESSION_ERROR",
      "Response body decoding failed",
      url,
      requestId,
      caught,
      wire.bytesRead,
      collector.bytesRead,
    );
  }
}

class WireLimitTransform extends Transform {
  public bytesRead = 0;
  private readonly limit: number;

  public constructor(limit: number) {
    super();
    this.limit = limit;
  }

  public override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.bytesRead += chunk.byteLength;
    if (this.bytesRead > this.limit) {
      callback(new BodyLimitError("compressed", this.limit));
      return;
    }
    callback(null, chunk);
  }
}

function decoderFor(rawEncoding: string | string[] | undefined): Duplex {
  const encodings = normalizeEncodings(rawEncoding);
  const decoders = [...encodings].reverse().map(createDecoder);
  const [first, ...rest] = decoders;
  if (first === undefined) return new PassThrough();
  let current: Duplex = first;
  for (const decoder of rest) current = current.compose(decoder);
  return current;
}

function normalizeEncodings(
  rawEncoding: string | string[] | undefined,
): readonly string[] {
  const raw = Array.isArray(rawEncoding)
    ? rawEncoding.join(",")
    : (rawEncoding ?? "identity");
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "" && value !== "identity");
}

function createDecoder(encoding: string): Transform {
  switch (encoding) {
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      throw new Error(`Unsupported content encoding: ${encoding}`);
  }
}

function failure(
  code: CrawlError["code"],
  message: string,
  url: string,
  requestId: string,
  cause: unknown,
  wireBytesRead: number,
  decodedBytesRead: number,
): BodyReadResult {
  return {
    body: null,
    wireBytesRead,
    decodedBytesRead,
    error: crawlError({ code, message, url, requestId, cause }),
  };
}
