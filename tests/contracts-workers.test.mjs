import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import { runtimeContracts } from "../dist/contracts/public.js";
import {
  parseWorkerMessage,
  SqliteWorkerCoordinator,
} from "../dist/workers/public.js";
import { temporaryDirectory } from "./helpers.mjs";

test("runtime contracts have unique names and schema identities", () => {
  const names = new Set();
  const schemas = new Set();
  for (const contract of runtimeContracts) {
    const name = contract.name;
    assert.equal(names.has(name), false, name);
    const schema = contract.schemaId;
    assert.equal(schemas.has(schema), false, schema);
    names.add(name);
    schemas.add(schema);
    assert.equal(
      contract.schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
  }
  assert.equal(runtimeContracts.length >= 25, true);
});

test("worker protocol and SQLite coordination preserve single origin ownership", async () => {
  const root = await temporaryDirectory("site-crawler-v09-workers-");
  const coordinator = new SqliteWorkerCoordinator(root);
  try {
    coordinator.register("worker-a", "run-1");
    coordinator.register("worker-b", "run-1");
    const options = {
      maxConcurrency: 1,
      minDelayMs: 0,
      leaseDurationMs: 30_000,
    };
    const first = coordinator.acquireOrigin(
      "https://example.com",
      "worker-a",
      options,
    );
    assert.notEqual(first, null);
    assert.equal(
      coordinator.acquireOrigin("https://example.com", "worker-b", options),
      null,
    );
    coordinator.releaseOrigin(first);
    assert.notEqual(
      coordinator.acquireOrigin("https://example.com", "worker-b", options),
      null,
    );
    const message = parseWorkerMessage({
      protocolVersion: "site-crawler.worker.v1",
      type: "heartbeat",
      workerId: "worker-a",
      runId: "run-1",
      sentAt: new Date().toISOString(),
      activeRequests: 1,
      completedRequests: 3,
    });
    assert.equal(message.type, "heartbeat");
    const leaseRequest = parseWorkerMessage({
      protocolVersion: "site-crawler.worker.v1",
      type: "lease-request",
      workerId: "worker-a",
      runId: "run-1",
      sentAt: new Date().toISOString(),
      capacity: 2,
      acceptedOrigins: ["https://example.com"],
    });
    assert.equal(leaseRequest.type, "lease-request");
    const terminal = parseWorkerMessage({
      protocolVersion: "site-crawler.worker.v1",
      type: "request-terminal",
      workerId: "worker-a",
      runId: "run-1",
      sentAt: new Date().toISOString(),
      leaseId: "lease-1",
      requestId: "request-1",
      state: "handled",
      reason: null,
    });
    assert.equal(terminal.type, "request-terminal");
  } finally {
    coordinator.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
