import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/public.js";
import { zeroCounters } from "../dist/crawler/run-records.js";
import { RetryingFetcher } from "../dist/crawler/retrying-fetcher.js";
import { SiteCrawler } from "../dist/index.js";
import { disposeResponseBody, responseBodyStream } from "../dist/http/body.js";
import { RunController } from "../dist/runtime/run-controller.js";
import { MemoryStore } from "../dist/storage/memory-store.js";
import { ScopePolicy } from "../dist/url/scope-policy.js";
import { replayRun } from "../dist/replay/public.js";
import {
  closeServer,
  crawlInput,
  listen,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

test("hard limits stop admission without aborting the boundary response", async () => {
  const html =
    "<html><head><title>Boundary</title></head><body>done</body></html>";
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  });
  const root = await temporaryDirectory("site-crawler-hard-limit-");
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        limits: {
          maxFetchedResources: 1,
        },
        storage: { type: "filesystem", directory: root },
      }),
    ).run();
    assert.equal(result.status, "stopped_by_limit");
    assert.deepEqual(result.stopDetail, {
      kind: "limit",
      limit: "max-fetched-resources",
    });
    assert.equal(result.stats.requestsFetched, 1);
    assert.equal(result.stats.htmlPagesParsed, 1);
    const states = await readNdjson(
      path.join(result.outputDirectory, "request-states.ndjson"),
    );
    assert.equal(
      states.some((state) => state.state === "handled"),
      true,
    );
    assert.equal(
      states.some((state) => state.state === "cancelled"),
      false,
    );

    const controller = new RunController(
      resolveConfig(crawlInput(fixture.origin)),
      zeroCounters(),
    );
    controller.beginInitialization();
    controller.beginRunning();
    controller.noteLimit("max-run-time");
    assert.equal(controller.shouldLeaseMore(), false);
    assert.equal(controller.cancellationSignal.aborted, false);
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("download limits preserve the XML response that crosses the boundary", async () => {
  const xml =
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "application/xml; charset=utf-8");
    response.end(xml);
  });
  const root = await temporaryDirectory("site-crawler-byte-limit-");
  try {
    const result = await new SiteCrawler(
      crawlInput(`${fixture.origin}/sitemap.xml`, {
        limits: {
          maxScheduledRequests: 1,
          maxFetchedResources: 10,
          maxDownloadedBytes: Buffer.byteLength(xml) - 1,
        },
        storage: { type: "filesystem", directory: root },
      }),
    ).run();
    assert.deepEqual(result.stopDetail, {
      kind: "limit",
      limit: "max-downloaded-bytes",
    });
    assert.equal(result.stats.requestsFetched, 1);
    assert.equal(result.stats.xmlResourcesParsed, 1);
    const states = await readNdjson(
      path.join(result.outputDirectory, "request-states.ndjson"),
    );
    assert.equal(states.at(-1)?.state, "handled");
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("XML uses one BOM-aware byte source for parsing, evidence, and replay", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-16"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>PLACEHOLDER/item</loc></url></urlset>';
  let payload = Buffer.alloc(0);
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "application/xml; charset=windows-1252");
    response.end(payload);
  });
  payload = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(xml.replace("PLACEHOLDER", fixture.origin), "utf16le"),
  ]);
  const root = await temporaryDirectory("site-crawler-xml-bytes-");
  try {
    const result = await new SiteCrawler(
      crawlInput(`${fixture.origin}/sitemap.xml`, {
        limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
        storage: {
          type: "filesystem",
          directory: root,
          storeRawXml: true,
        },
      }),
    ).run();
    const resources = await readNdjson(
      path.join(result.outputDirectory, "xml.ndjson"),
    );
    assert.equal(resources.length, 1);
    const resource = resources[0];
    assert.equal(resource.xmlKind, "sitemap");
    assert.equal(resource.parseStatus.kind, "well-formed");
    assert.equal(resource.encoding.source, "bom");
    assert.equal(resource.encoding.encoding, "utf-16le");
    assert.equal(
      resource.sitemapEntries[0].normalizedUrl,
      `${fixture.origin}/item`,
    );
    assert.equal(resource.evidence.capture.kind, "complete");
    const evidenceBytes = await fs.readFile(
      path.join(result.outputDirectory, resource.evidence.relativePath),
    );
    assert.deepEqual(evidenceBytes, payload);

    const firstReplay = await replayRun(result.outputDirectory);
    const secondReplay = await replayRun(result.outputDirectory);
    assert.equal(firstReplay.changed, 0);
    assert.equal(firstReplay.failed, 0);
    assert.deepEqual(
      firstReplay.items.map(replayIdentity),
      secondReplay.items.map(replayIdentity),
    );
    assert.equal(
      firstReplay.items.some(
        (item) => item.evidenceDigest === resource.evidence.digest,
      ),
      true,
    );
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("XML decoding and budget failures retain structured failure state", async () => {
  const cases = [
    {
      path: "/encoding.xml",
      contentType: "application/xml; charset=not-a-charset",
      body: Buffer.from("<root/>", "utf8"),
      expected: "decoding-failed",
      parsing: {},
    },
    {
      path: "/budget.xml",
      contentType: "application/xml",
      body: Buffer.from("<root>over-budget</root>", "utf8"),
      expected: "budget-exceeded",
      parsing: { xml: { maxStreamBytes: 8 } },
    },
  ];
  for (const fixtureCase of cases) {
    const fixture = await listen((_request, response) => {
      response.setHeader("content-type", fixtureCase.contentType);
      response.end(fixtureCase.body);
    });
    const root = await temporaryDirectory("site-crawler-xml-failure-");
    try {
      const result = await new SiteCrawler({
        ...crawlInput(`${fixture.origin}${fixtureCase.path}`, {
          limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
          storage: { type: "filesystem", directory: root },
        }),
        parsing: fixtureCase.parsing,
      }).run();
      const resources = await readNdjson(
        path.join(result.outputDirectory, "xml.ndjson"),
      );
      assert.equal(resources[0].parseStatus.kind, fixtureCase.expected);
      if (fixtureCase.expected === "budget-exceeded") {
        assert.equal(resources[0].parserBudgets.status, "exceeded");
        assert.equal(resources[0].parserBudgets.budget, "maxInputBytes");
      }
    } finally {
      await closeServer(fixture.server);
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

test("retrying a file-backed response always disposes the discarded body", async () => {
  const root = await temporaryDirectory("site-crawler-retry-body-");
  const discarded = path.join(root, "discarded.body");
  await fs.writeFile(discarded, "retry", { mode: 0o600 });
  let calls = 0;
  const retrying = retryingFetcher({
    fetcher: {
      async fetch(url) {
        calls += 1;
        return fetchResult(
          url,
          calls === 1 ? 503 : 200,
          calls === 1
            ? { kind: "file", path: discarded, size: 5, temporary: true }
            : { kind: "memory", bytes: new Uint8Array(), size: 0 },
        );
      },
    },
    store: {
      async writeError() {},
      async writeRequestState() {},
    },
  });
  try {
    const result = await retrying.fetch(
      {
        id: "request",
        normalizedUrl: "https://example.com/",
        method: "GET",
        headers: {},
        maxRetries: 1,
      },
      new AbortController().signal,
    );
    assert.equal(result.statusCode, 200);
    assert.equal(calls, 2);
    await assert.rejects(fs.access(discarded));

    const persistenceFailureBody = path.join(root, "persistence-failure.body");
    await fs.writeFile(persistenceFailureBody, "retry", { mode: 0o600 });
    const failing = retryingFetcher({
      fetcher: {
        async fetch(url) {
          return fetchResult(url, 503, {
            kind: "file",
            path: persistenceFailureBody,
            size: 5,
            temporary: true,
          });
        },
      },
      store: {
        async writeError() {
          throw new Error("persistence failed");
        },
        async writeRequestState() {},
      },
    });
    await assert.rejects(
      failing.fetch(
        {
          id: "request",
          normalizedUrl: "https://example.com/",
          method: "GET",
          headers: {},
          maxRetries: 1,
        },
        new AbortController().signal,
      ),
      /persistence failed/u,
    );
    await assert.rejects(fs.access(persistenceFailureBody));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("file response streams pull on demand and cancel without draining", async () => {
  const root = await temporaryDirectory("site-crawler-demand-stream-");
  const file = path.join(root, "large.body");
  const size = 1024 * 1024;
  await fs.writeFile(file, Buffer.alloc(size, 0x61), { mode: 0o600 });
  const reader = responseBodyStream({
    kind: "file",
    path: file,
    size,
    temporary: false,
  }).getReader();
  try {
    const first = await reader.read();
    assert.equal(first.done, false);
    assert.equal(first.value.byteLength < size, true);
    await reader.cancel("consumer stopped");
    await fs.rm(file);
  } finally {
    reader.releaseLock();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("link caps count valid candidates and preserve empty href semantics", async () => {
  const fixture = await listen((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/") {
      response.end(`<html><body>
        <a>missing</a><area><link rel="stylesheet">
        <a href="mailto:test@example.com">mail</a><area href="http://[">
        <a href="">same document</a>
        <a href="/late">late</a></body></html>`);
      return;
    }
    response.end("<html><body>late</body></html>");
  });
  const root = await temporaryDirectory("site-crawler-valid-link-cap-");
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        limits: { maxDiscoveredLinksPerPage: 2, maxScheduledRequests: 2 },
        storage: { type: "filesystem", directory: root },
      }),
    ).run();
    const pages = await readNdjson(
      path.join(result.outputDirectory, "pages.ndjson"),
    );
    const page = pages.find(
      (candidate) => candidate.finalUrl === `${fixture.origin}/`,
    );
    assert.equal(page.discoveredOutgoingLinkCount, 2);
    assert.equal(page.recordedOutgoingLinkCount, 2);
    assert.equal(page.truncatedOutgoingLinkCount, 0);
    assert.equal(page.facts.anchors[0].rawHref, null);
    assert.equal(
      page.facts.anchors.find((anchor) => anchor.rawHref === "")?.normalizedUrl,
      `${fixture.origin}/`,
    );
    const links = await readNdjson(
      path.join(result.outputDirectory, "links.ndjson"),
    );
    assert.deepEqual(
      links
        .filter((link) => link.fromUrl === `${fixture.origin}/`)
        .map((link) => link.toRaw),
      ["", "/late"],
    );
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scope reservations are per-seed and reconstruct from durable requests", () => {
  const config = resolveConfig({
    seeds: [
      {
        url: "https://one.example/root/",
        scope: { maxUrlsPerDirectory: 1, maxUrlsPerPathPattern: 1 },
      },
      {
        url: "https://two.example/root/",
        scope: { maxUrlsPerDirectory: 2, maxUrlsPerPathPattern: 2 },
      },
    ],
    robots: { enabled: false },
    sitemaps: { enabled: false },
  });
  const policy = new ScopePolicy(config.scope, config.seeds);
  const first = policy.prepareReservation(
    "https://one.example/root/1",
    config.seeds[0].normalizedUrl,
  );
  first.commit();
  assert.equal(
    policy.prepareReservation(
      "https://one.example/root/2",
      config.seeds[0].normalizedUrl,
    ).decision.allowed,
    false,
  );
  assert.equal(
    policy.prepareReservation(
      "https://two.example/root/2",
      config.seeds[1].normalizedUrl,
    ).decision.allowed,
    true,
  );

  policy.restoreReservations([
    {
      normalizedUrl: "https://two.example/root/1",
      seedUrl: config.seeds[1].normalizedUrl,
    },
    {
      normalizedUrl: "https://two.example/root/2",
      seedUrl: config.seeds[1].normalizedUrl,
    },
  ]);
  assert.equal(
    policy.prepareReservation(
      "https://two.example/root/3",
      config.seeds[1].normalizedUrl,
    ).decision.allowed,
    false,
  );
});

test("persistent stores reject records outside their exact runtime contract", async () => {
  const store = new MemoryStore(false, false);
  await assert.rejects(
    store.writeError({
      schemaId: "site-crawler.error",
      schemaVersion: 1,
      code: "INTERNAL_ERROR",
      message: "invalid shape",
      url: null,
      requestId: null,
      retryable: false,
      fatal: true,
      attempt: null,
      causeName: null,
      causeMessage: null,
      createdAt: new Date(0).toISOString(),
      unexpected: true,
    }),
    /does not satisfy/u,
  );
});

test("run storage is private even when the parent was permissive", async () => {
  if (process.platform === "win32") return;
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<html><body>private</body></html>");
  });
  const root = await temporaryDirectory("site-crawler-private-files-");
  await fs.chmod(root, 0o777);
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        storage: { type: "filesystem", directory: root, storeRawHtml: true },
      }),
    ).run();
    assert.equal((await fs.stat(result.outputDirectory)).mode & 0o777, 0o700);
    for (const file of ["manifest.json", "pages.ndjson", "evidence.ndjson"]) {
      assert.equal(
        (await fs.stat(path.join(result.outputDirectory, file))).mode & 0o777,
        0o600,
      );
    }
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

function replayIdentity(item) {
  return {
    entity: item.entity,
    requestId: item.requestId,
    evidenceDigest: item.evidenceDigest,
    previousHash: item.previousHash,
    replayedHash: item.replayedHash,
    status: item.status,
  };
}

function fetchResult(url, statusCode, body) {
  return {
    statusCode,
    finalUrl: url,
    headers: new Headers(),
    body,
    redirects: [],
    responseTimeMs: 1,
    wireBytesRead: body.size,
    decodedBytesRead: body.size,
    remoteAddress: "127.0.0.1",
    protocol: "http1.1",
    timings: {
      dnsMs: null,
      connectMs: null,
      tlsMs: null,
      firstByteMs: 1,
      bodyMs: 0,
      totalMs: 1,
    },
    tls: null,
    cacheStatus: "miss",
    error: null,
  };
}

function retryingFetcher({ fetcher, store }) {
  return new RetryingFetcher({
    runId: "run_retry",
    config: resolveConfig({
      seeds: ["https://example.com/"],
      network: { retries: 1, retryBackoffMs: 1 },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "memory" },
    }),
    fetcher,
    store,
    frontier: {
      stateRecord() {
        return {};
      },
    },
    seeds: {
      forRequest() {
        return null;
      },
    },
    redirects: {
      async decide() {
        throw new Error("not reached");
      },
    },
    counters: { retries: 0 },
    emit() {},
  });
}
