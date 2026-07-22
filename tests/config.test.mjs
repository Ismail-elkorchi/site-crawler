import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createConfigFingerprints,
  resolveConfig,
  validateConfig,
} from "../dist/config/index.js";

test("resolved configuration is deeply frozen plain data", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    scope: { include: ["/docs"] },
    storage: { type: "memory" },
  });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.scope), true);
  assert.equal(Object.isFrozen(config.scope.include), true);
  assert.throws(() => config.scope.include.push("/other"), TypeError);
});

test("configuration rejects accessor properties", () => {
  const input = { seeds: ["https://example.com/"] };
  Object.defineProperty(input, "scope", {
    enumerable: true,
    get() {
      return {};
    },
  });
  assert.throws(() => resolveConfig(input), /accessor property/u);
});

test("configuration rejects runtime functions", () => {
  assert.throws(
    () =>
      resolveConfig({
        seeds: ["https://example.com/"],
        output: { hashBodies: () => true },
      }),
    /non-data value/u,
  );
});

test("operational fingerprints ignore operational settings only", () => {
  const first = resolveConfig({
    seeds: ["https://example.com/"],
    network: { maxConcurrency: 2 },
    storage: { type: "filesystem", directory: "./one" },
  });
  const second = resolveConfig({
    seeds: ["https://example.com/"],
    network: { maxConcurrency: 20 },
    storage: { type: "filesystem", directory: "./two", fsync: true },
  });
  const third = resolveConfig({
    seeds: ["https://example.com/"],
    limits: { maxDepth: 2 },
    storage: { type: "filesystem", directory: "./two" },
  });
  const a = createConfigFingerprints(first);
  const b = createConfigFingerprints(second);
  const c = createConfigFingerprints(third);
  assert.notEqual(a.exact, b.exact);
  assert.equal(a.operational, b.operational);
  assert.notEqual(a.operational, c.operational);
});

test("storage types select matching frontier backends by default", () => {
  const memory = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "memory" },
  });
  const filesystem = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "filesystem" },
  });
  const sqlite = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "sqlite" },
  });
  assert.equal(memory.storage.frontierBackend, "memory");
  assert.equal(filesystem.storage.frontierBackend, "journal");
  assert.equal(sqlite.storage.frontierBackend, "sqlite");
});

test("an explicit durable frontier backend overrides the storage default", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "filesystem", frontierBackend: "sqlite" },
  });
  assert.equal(config.storage.type, "filesystem");
  assert.equal(config.storage.frontierBackend, "sqlite");
});

test("operational fingerprints classify operational fields explicitly", () => {
  const baseline = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "filesystem", directory: "./first" },
  });
  const operational = resolveConfig({
    seeds: ["https://example.com/"],
    network: {
      maxConcurrency: 32,
      maxConcurrencyPerOrigin: 8,
      minDelayMsPerOrigin: 20,
      autoThrottle: { startDelayMs: 500, maxDelayMs: 60000 },
    },
    session: { persistCookies: true, cookieFile: "./cookies.json" },
    responseLimits: {
      memoryThresholdBytes: 4096,
      spoolDirectory: "./spool",
    },
    storage: {
      type: "filesystem",
      directory: "./second",
      leaseDurationMs: 90000,
      leaseRenewalIntervalMs: 30000,
      writeBufferSize: 500,
      fsync: true,
      storeRawHtml: true,
      writeNdjsonExports: false,
    },
    output: { writeSkippedUrls: false, writeSummary: false },
  });
  const semantic = resolveConfig({
    seeds: ["https://example.com/"],
    network: { protocolPreference: "http2" },
    storage: { type: "filesystem", directory: "./second" },
  });
  const a = createConfigFingerprints(baseline);
  const b = createConfigFingerprints(operational);
  const c = createConfigFingerprints(semantic);
  assert.notEqual(a.exact, b.exact);
  assert.equal(a.operational, b.operational);
  assert.notEqual(a.operational, c.operational);
});

test("operational fingerprints retain crawl-semantic features", () => {
  const baseline = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "sqlite" },
  });
  const cacheEnabled = resolveConfig({
    seeds: ["https://example.com/"],
    httpCache: { enabled: true },
    storage: { type: "sqlite" },
  });
  const javascriptEnabled = resolveConfig({
    seeds: ["https://example.com/"],
    jsDiscovery: { enabled: true },
    storage: { type: "sqlite" },
  });
  const baselineFingerprint = createConfigFingerprints(baseline).operational;
  assert.notEqual(
    baselineFingerprint,
    createConfigFingerprints(cacheEnabled).operational,
  );
  assert.notEqual(
    baselineFingerprint,
    createConfigFingerprints(javascriptEnabled).operational,
  );
});

test("operational fingerprints distinguish semantic settings", () => {
  const base = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "filesystem" },
  });
  const operational = resolveConfig({
    seeds: ["https://example.com/"],
    network: {
      maxConcurrency: 32,
      maxConcurrencyPerOrigin: 8,
      minDelayMsPerOrigin: 25,
      maxRequestsPerMinutePerOrigin: 120,
      autoThrottle: {
        enabled: false,
        targetConcurrencyPerOrigin: 4,
        startDelayMs: 250,
        minDelayMs: 10,
        maxDelayMs: 60_000,
        smoothing: 0.5,
      },
    },
    storage: {
      type: "filesystem",
      directory: "./elsewhere",
      writeBufferSize: 500,
      fsync: true,
      storeRawHtml: true,
      storeRawXml: true,
      writeNdjsonExports: false,
    },
    output: { writeSkippedUrls: false, writeSummary: false },
  });
  const semanticVariants = [
    resolveConfig({
      seeds: ["https://example.com/"],
      network: { protocolPreference: "http1" },
      storage: { type: "filesystem" },
    }),
    resolveConfig({
      seeds: ["https://example.com/"],
      session: { enabled: true },
      storage: { type: "filesystem" },
    }),
    resolveConfig({
      seeds: ["https://example.com/"],
      httpCache: { enabled: true },
      storage: { type: "filesystem" },
    }),
    resolveConfig({
      seeds: ["https://example.com/"],
      jsDiscovery: { enabled: true },
      storage: { type: "filesystem" },
    }),
    resolveConfig({
      seeds: ["https://example.com/"],
      cssDiscovery: { enabled: true },
      storage: { type: "filesystem" },
    }),
    resolveConfig({
      seeds: ["https://example.com/"],
      output: { hashBodies: false },
      storage: { type: "filesystem" },
    }),
    resolveConfig({
      seeds: ["https://example.com/"],
      storage: { type: "filesystem", frontierBackend: "sqlite" },
    }),
  ];
  const baseFingerprint = createConfigFingerprints(base);
  assert.equal(
    baseFingerprint.operational,
    createConfigFingerprints(operational).operational,
  );
  for (const variant of semanticVariants) {
    assert.notEqual(
      baseFingerprint.operational,
      createConfigFingerprints(variant).operational,
    );
  }
});

test("persistent cookies require run-local filesystem storage", () => {
  assert.throws(
    () =>
      validateConfig(
        resolveConfig({
          seeds: ["https://example.com/"],
          session: { enabled: true, persistCookies: true },
          storage: { type: "memory" },
        }),
      ),
    /filesystem-backed crawl storage/u,
  );
});

test("XML text budgets are configurable and validated", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    parsing: { xml: { maxTextBytes: 8 * 1024 * 1024 } },
    storage: { type: "memory" },
  });
  assert.equal(config.parsing.xml.maxTextBytes, 8 * 1024 * 1024);
  assert.throws(
    () =>
      validateConfig(
        resolveConfig({
          seeds: ["https://example.com/"],
          parsing: { xml: { maxTextBytes: 0 } },
          storage: { type: "memory" },
        }),
      ),
    /parsing\.xml\.maxTextBytes/u,
  );
});
