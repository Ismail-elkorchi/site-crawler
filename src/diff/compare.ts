import { createHash } from "node:crypto";
import path from "node:path";
import { makeId, nowIso } from "../core/utils.js";
import { readDiffSnapshot } from "./snapshot.js";
import type { CrawlChange, CrawlChangeKind, CrawlDiffReport } from "./types.js";
import { writePrivateFileAtomic } from "../core/private-files.js";
import { validatePersistedRecord } from "../contracts/catalog.js";

export interface CompareRunsOptions {
  readonly outputPath?: string;
  readonly detectedAt?: string;
}

export async function compareRuns(
  baseRunDirectory: string,
  targetRunDirectory: string,
  options: CompareRunsOptions = {},
): Promise<CrawlDiffReport> {
  const base = await readDiffSnapshot(baseRunDirectory);
  const target = await readDiffSnapshot(targetRunDirectory);
  const detectedAt = options.detectedAt ?? nowIso();
  const changes: CrawlChange[] = [];
  compareResources(base.resources, target.resources, detectedAt, changes);
  comparePages(base.pages, target.pages, detectedAt, changes);
  compareMembership(
    "link",
    "link-added",
    "link-removed",
    base.links,
    target.links,
    detectedAt,
    changes,
  );
  compareMembership(
    "sitemap",
    "sitemap-added",
    "sitemap-removed",
    base.sitemaps,
    target.sitemaps,
    detectedAt,
    changes,
  );
  compareRobots(base.robots, target.robots, detectedAt, changes);
  changes.sort(compareChanges);
  const report: CrawlDiffReport = {
    schemaId: "site-crawler.diffReport",
    schemaVersion: 1,
    baseRunDirectory: path.resolve(baseRunDirectory),
    targetRunDirectory: path.resolve(targetRunDirectory),
    createdAt: detectedAt,
    summary: summarize(changes),
    changes,
  };
  validatePersistedRecord(report);
  if (options.outputPath !== undefined) {
    await writePrivateFileAtomic(
      options.outputPath,
      `${JSON.stringify(report, null, 2)}\n`,
      false,
    );
  }
  return report;
}

function compareResources(
  before: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  after: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  detectedAt: string,
  output: CrawlChange[],
): void {
  compareEntities(
    "resource",
    before,
    after,
    detectedAt,
    output,
    (left, right) => {
      const changes: CrawlChangeKind[] = [];
      if (left["statusCode"] !== right["statusCode"])
        changes.push("status-changed");
      if (left["finalUrl"] !== right["finalUrl"])
        changes.push("redirect-changed");
      if (left["contentType"] !== right["contentType"])
        changes.push("content-type-changed");
      if (stableHash(left["bodyHash"]) !== stableHash(right["bodyHash"]))
        changes.push("body-changed");
      return changes;
    },
  );
}

function comparePages(
  before: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  after: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  detectedAt: string,
  output: CrawlChange[],
): void {
  compareEntities(
    "html-page",
    before,
    after,
    detectedAt,
    output,
    (left, right) => {
      const a = facts(left);
      const b = facts(right);
      const changes: CrawlChangeKind[] = [];
      if (stableHash(a["title"]) !== stableHash(b["title"]))
        changes.push("title-changed");
      if (stableHash(a["canonical"]) !== stableHash(b["canonical"]))
        changes.push("canonical-changed");
      if (stableHash(a["metaDescription"]) !== stableHash(b["metaDescription"]))
        changes.push("meta-description-changed");
      if (stableHash(a["headings"]) !== stableHash(b["headings"]))
        changes.push("headings-changed");
      if (stableHash(a["visibleText"]) !== stableHash(b["visibleText"]))
        changes.push("text-changed");
      return changes;
    },
  );
}

function compareEntities(
  entity: "resource" | "html-page",
  before: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  after: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  detectedAt: string,
  output: CrawlChange[],
  modified: (
    left: Readonly<Record<string, unknown>>,
    right: Readonly<Record<string, unknown>>,
  ) => readonly CrawlChangeKind[],
): void {
  for (const [key, left] of before) {
    const right = after.get(key);
    if (right === undefined)
      output.push(change(entity, "disappeared", key, left, null, detectedAt));
    else
      for (const kind of modified(left, right))
        output.push(change(entity, kind, key, left, right, detectedAt));
  }
  for (const [key, right] of after) {
    if (!before.has(key))
      output.push(change(entity, "appeared", key, null, right, detectedAt));
  }
}

function compareMembership(
  entity: "link" | "sitemap",
  added: "link-added" | "sitemap-added",
  removed: "link-removed" | "sitemap-removed",
  before: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  after: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  detectedAt: string,
  output: CrawlChange[],
): void {
  for (const [key, left] of before)
    if (!after.has(key))
      output.push(change(entity, removed, key, left, null, detectedAt));
  for (const [key, right] of after)
    if (!before.has(key))
      output.push(change(entity, added, key, null, right, detectedAt));
}

function compareRobots(
  before: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  after: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  detectedAt: string,
  output: CrawlChange[],
): void {
  for (const [key, left] of before) {
    const right = after.get(key);
    if (right === undefined) {
      output.push(change("robots", "disappeared", key, left, null, detectedAt));
    } else if (
      stableHash(replayableRobots(left)) !== stableHash(replayableRobots(right))
    ) {
      output.push(
        change("robots", "robots-changed", key, left, right, detectedAt),
      );
    }
  }
  for (const [key, right] of after) {
    if (!before.has(key)) {
      output.push(change("robots", "appeared", key, null, right, detectedAt));
    }
  }
}

function replayableRobots(value: Readonly<Record<string, unknown>>): unknown {
  return {
    origin: value["origin"],
    status: value["status"],
    groups: value["groups"],
    sitemaps: value["sitemaps"],
    crawlDelayMs: value["crawlDelayMs"],
    diagnostics: value["diagnostics"],
  };
}

function compareChanges(left: CrawlChange, right: CrawlChange): number {
  return `${left.entity}\u0000${left.key}\u0000${left.kind}`.localeCompare(
    `${right.entity}\u0000${right.key}\u0000${right.kind}`,
  );
}

function change(
  entity: CrawlChange["entity"],
  kind: CrawlChangeKind,
  key: string,
  before: unknown | null,
  after: unknown | null,
  detectedAt: string,
): CrawlChange {
  return {
    schemaId: "site-crawler.change",
    schemaVersion: 1,
    id: makeId("change", `${entity}:${kind}:${key}`),
    entity,
    kind,
    key,
    before,
    after,
    detectedAt,
  };
}

function facts(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const value = record["facts"];
  return isRecord(value) ? value : {};
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function summarize(
  changes: readonly CrawlChange[],
): CrawlDiffReport["summary"] {
  return {
    appeared: changes.filter((item) => item.kind === "appeared").length,
    disappeared: changes.filter((item) => item.kind === "disappeared").length,
    modified: changes.filter(
      (item) =>
        ![
          "appeared",
          "disappeared",
          "link-added",
          "link-removed",
          "sitemap-added",
          "sitemap-removed",
        ].includes(item.kind),
    ).length,
    linksAdded: changes.filter((item) => item.kind === "link-added").length,
    linksRemoved: changes.filter((item) => item.kind === "link-removed").length,
    sitemapAdded: changes.filter((item) => item.kind === "sitemap-added")
      .length,
    sitemapRemoved: changes.filter((item) => item.kind === "sitemap-removed")
      .length,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
