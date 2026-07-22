import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ResponseBody } from "./body-types.js";

export function responseBodySize(body: ResponseBody | null): number {
  return body?.size ?? 0;
}

export async function readResponseBody(
  body: ResponseBody,
): Promise<Uint8Array> {
  return body.kind === "memory" ? body.bytes : await fs.readFile(body.path);
}

export async function responseBodyPrefix(
  body: ResponseBody,
  maxBytes: number,
): Promise<Uint8Array> {
  if (body.kind === "memory") return body.bytes.slice(0, maxBytes);
  const handle = await fs.open(body.path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(maxBytes, body.size));
    const result = await handle.read(buffer, 0, buffer.byteLength, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export function responseBodyStream(
  body: ResponseBody,
): ReadableStream<Uint8Array> {
  if (body.kind === "memory") {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body.bytes);
        controller.close();
      },
    });
  }
  return nodeStreamToWeb(createReadStream(body.path));
}

export async function disposeResponseBody(
  body: ResponseBody | null,
): Promise<void> {
  if (body?.kind === "file" && body.temporary) {
    await fs.rm(body.path, { force: true });
  }
}

export function nodeReadableFromWeb(
  stream: ReadableStream<Uint8Array>,
): Readable {
  return Readable.from(readWebStream(stream));
}

async function* readWebStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function nodeStreamToWeb(source: Readable): ReadableStream<Uint8Array> {
  const iterator: AsyncIterator<unknown> = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (result.done === true) {
          controller.close();
          return;
        }
        controller.enqueue(toBytes(result.value));
      } catch (caught) {
        controller.error(caught);
      }
    },
    async cancel(reason) {
      source.destroy(reason instanceof Error ? reason : undefined);
      await iterator.return?.();
    },
  });
}

function toBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (typeof chunk === "string") return new TextEncoder().encode(chunk);
  throw new TypeError("Node stream produced a non-byte chunk.");
}
