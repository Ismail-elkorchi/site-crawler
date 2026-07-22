import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { decompressXmlPayload } from "../dist/experimental/public.js";

const url = "https://example.com/sitemap.xml.gz";

test("decompresses gzip XML under an explicit budget", async () => {
  const source = Buffer.from("<urlset><url/></urlset>");
  const result = await decompressXmlPayload(
    gzipSync(source),
    1_000,
    url,
    "request",
  );
  assert.equal(result.error, null);
  assert.equal(Buffer.from(result.bytes).toString("utf8"), source.toString());
});

test("rejects gzip XML whose decoded output exceeds the budget", async () => {
  const result = await decompressXmlPayload(
    gzipSync(Buffer.from("x".repeat(1_000))),
    20,
    url,
    "request",
  );
  assert.equal(result.bytes, null);
  assert.equal(result.error.code, "XML_BUDGET_EXCEEDED");
});

test("reports malformed gzip XML", async () => {
  const result = await decompressXmlPayload(
    Uint8Array.from([0x1f, 0x8b, 0x00, 0x01]),
    1_000,
    url,
    "request",
  );
  assert.equal(result.bytes, null);
  assert.equal(result.error.code, "XML_PARSE_ERROR");
});

test("honors cancellation during XML decompression", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await decompressXmlPayload(
    gzipSync(Buffer.from("x".repeat(10_000))),
    20_000,
    url,
    "request",
    controller.signal,
  );
  assert.equal(result.bytes, null);
  assert.equal(result.error.code, "FETCH_ABORTED");
});
