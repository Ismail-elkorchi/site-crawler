import assert from "node:assert/strict";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { closeServer, crawlInput, listen } from "./helpers.mjs";

async function fixtureServer() {
  return await listen((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<html><body>fixture</body></html>");
  });
}

test("request middleware can skip without recording transport failure", async () => {
  let hits = 0;
  const fixture = await listen((_request, response) => {
    hits += 1;
    response.end("unexpected");
  });
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
      }),
      {
        middlewares: {
          beforeRequest: [
            () => ({
              kind: "skip",
              reason: "USER_EXCLUDE_PATTERN",
              detail: "fixture skip",
            }),
          ],
        },
      },
    ).run();
    assert.equal(result.status, "completed");
    assert.equal(result.stats.requestsPolicySkipped, 1);
    assert.equal(result.stats.requestsTransportFailed, 0);
    assert.equal(hits, 0);
  } finally {
    await closeServer(fixture.server);
  }
});

for (const expectation of [
  { mode: "record", status: "completed", failed: 0 },
  { mode: "fail-request", status: "partial", failed: 1 },
  { mode: "fail-run", status: "failed", failed: 1 },
]) {
  test(`extension failure mode '${expectation.mode}' has explicit run semantics`, async () => {
    const fixture = await fixtureServer();
    try {
      const result = await new SiteCrawler(crawlInput(fixture.origin), {
        failureMode: expectation.mode,
        hooks: {
          onHtmlParsed() {
            throw new Error("extension fixture failure");
          },
        },
      }).run();
      assert.equal(result.status, expectation.status);
      assert.equal(result.stats.requestsFailed, expectation.failed);
      if (expectation.mode === "fail-run") {
        assert.equal(result.fatalError.code, "EXTENSION_ERROR");
      }
    } finally {
      await closeServer(fixture.server);
    }
  });
}
