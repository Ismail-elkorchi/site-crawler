import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { ContentAddressedEvidenceStore } from "../dist/evidence/public.js";
import {
  closeServer,
  listen,
  readJson,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

test("content-addressed evidence is immutable and deduplicated", async () => {
  const root = await temporaryDirectory("site-crawler-v09-evidence-");
  try {
    const store = new ContentAddressedEvidenceStore(root);
    await store.init();
    const bytes = Buffer.from("<p>same</p>");
    const first = await store.writeBytes("html", "text/html", bytes);
    const second = await store.writeBytes("html", "text/html", bytes);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.reference.digest, second.reference.digest);
    assert.equal(
      Buffer.from(await store.read(first.reference)).toString("utf8"),
      "<p>same</p>",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("evidence bundles verify hashes and reject tampering", async () => {
  const root = await temporaryDirectory("site-crawler-v09-bundle-");
  const run = path.join(root, "run");
  const target = path.join(root, "bundle");
  try {
    await fs.mkdir(run, { recursive: true });
    await fs.writeFile(
      path.join(run, "manifest.json"),
      `${JSON.stringify({ runId: "run-bundle", startedAt: new Date(0).toISOString(), finishedAt: null })}\n`,
    );
    const store = new ContentAddressedEvidenceStore(run);
    await store.init();
    const evidence = await store.writeBytes(
      "html",
      "text/html",
      Buffer.from("<p>bundle</p>"),
    );
    await fs.writeFile(
      path.join(run, "evidence.ndjson"),
      `${JSON.stringify({ schemaId: "site-crawler.evidenceAssociation", schemaVersion: 1, requestId: "request-1", reference: evidence.reference, recordedAt: new Date(0).toISOString() })}\n`,
    );
    const { createEvidenceBundle, verifyEvidenceBundle } =
      await import("../dist/evidence/public.js");
    await createEvidenceBundle(run, {
      targetDirectory: target,
      compressObjects: true,
    });
    assert.equal((await verifyEvidenceBundle(target)).valid, true);
    const bundle = await readJson(path.join(target, "bundle.json"));
    const object = bundle.files.find((file) =>
      file.sourcePath.startsWith("evidence/"),
    );
    await fs.appendFile(path.join(target, object.bundlePath), "tampered");
    assert.equal((await verifyEvidenceBundle(target)).valid, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("content-addressed writes reject a corrupt existing object", async () => {
  const root = await temporaryDirectory("site-crawler-v09-evidence-conflict-");
  try {
    const store = new ContentAddressedEvidenceStore(root);
    await store.init();
    const bytes = Buffer.from("expected");
    const first = await store.writeBytes("html", "text/html", bytes);
    await fs.writeFile(store.absolutePath(first.reference), "corrupt!");
    await assert.rejects(
      store.writeBytes("html", "text/html", bytes),
      /corrupt/u,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
