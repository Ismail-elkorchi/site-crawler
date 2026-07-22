import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/public.js";
import { NetworkSafetyPolicy } from "../dist/network/index.js";

function safetyConfig(overrides = {}) {
  return resolveConfig({
    seeds: ["https://example.com/"],
    networkSafety: overrides,
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  }).networkSafety;
}

test("network safety rejects a hostname with mixed public and private answers", async () => {
  const policy = new NetworkSafetyPolicy(
    safetyConfig({ mixedAddressPolicy: "reject-host" }),
    async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
  );
  const resolution = await policy.resolve("https://mixed.example/");
  assert.equal(resolution.decision.allowed, false);
  assert.deepEqual(resolution.addresses, [
    { address: "93.184.216.34", family: 4 },
  ]);
  assert.deepEqual(resolution.rejectedAddresses, [
    { address: "127.0.0.1", family: 4 },
  ]);
});

test("network safety can retain only approved answers for a mixed hostname", async () => {
  const policy = new NetworkSafetyPolicy(
    safetyConfig({ mixedAddressPolicy: "use-safe-addresses-only" }),
    async () => [
      { address: "127.0.0.1", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ],
  );
  const resolution = await policy.resolve("https://mixed.example/");
  assert.equal(resolution.decision.allowed, true);
  assert.equal(resolution.decision.checkedIp, "93.184.216.34");
  assert.deepEqual(resolution.addresses, [
    { address: "93.184.216.34", family: 4 },
  ]);
});

test("network safety recognizes bracketed IPv4-mapped IPv6 literals", async () => {
  const policy = new NetworkSafetyPolicy(safetyConfig());
  const resolution = await policy.resolve("http://[::ffff:127.0.0.1]/");
  assert.equal(resolution.decision.allowed, false);
  assert.equal(resolution.decision.checkedIp, "::ffff:7f00:1");
});

test("disabled network safety permits a private literal without DNS", async () => {
  const policy = new NetworkSafetyPolicy(safetyConfig({ enabled: false }));
  const resolution = await policy.resolve("http://127.0.0.1/");
  assert.equal(resolution.decision.allowed, true);
  assert.equal(resolution.decision.checkedIp, "127.0.0.1");
});
