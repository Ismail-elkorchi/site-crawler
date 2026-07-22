import path from "node:path";
import { installedPackageVersion } from "../core/dependency-version.js";
import { SITE_CRAWLER_VERSION } from "../core/version.js";
import { ContentAddressedEvidenceStore } from "../evidence/content-addressed-store.js";
import { parseEvidenceReference } from "../evidence/parse.js";
import { decodeBody } from "../encoding/index.js";
import { extractHtmlFacts } from "../html/extractor.js";
import { validHtmlLinkCandidates } from "../html/link-decider.js";
import { addLinkTruncationWarning } from "../html/page-record.js";
import { openRunReader } from "../runs/reader.js";
import { extractXmlResource } from "../xml/extractor.js";
import { replayConfig } from "./config.js";
import {
  replayableHtml,
  replayableXml,
  stableHash,
  xRobotsTagFromFacts,
} from "./projection.js";
import type { ReplayItem, ReplayReport } from "./types.js";
import { writePrivateFileAtomic } from "../core/private-files.js";
import { validatePersistedRecord } from "../contracts/catalog.js";

export interface ReplayRunOptions {
  readonly outputPath?: string;
}

export async function replayRun(
  runDirectory: string,
  options: ReplayRunOptions = {},
): Promise<ReplayReport> {
  const directory = path.resolve(runDirectory);
  const startedAt = new Date().toISOString();
  const reader = await openRunReader(directory);
  const evidence = new ContentAddressedEvidenceStore(directory);
  const items: ReplayItem[] = [];
  try {
    const config = replayConfig(await reader.metadata("config"));
    for await (const record of reader.records("html-page")) {
      items.push(await replayHtml(record.data, config, evidence));
    }
    for await (const record of reader.records("xml-resource")) {
      items.push(await replayXml(record.data, config, evidence));
    }
  } finally {
    await reader.close();
  }
  const report = createReport(directory, startedAt, items);
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

async function replayHtml(
  value: unknown,
  config: ReturnType<typeof replayConfig>,
  evidence: ContentAddressedEvidenceStore,
): Promise<ReplayItem> {
  if (!isRecord(value))
    return failed("html-page", "unknown", "unknown", "HTML record is invalid.");
  const requestId = text(value["requestId"], "unknown");
  const url = text(value["finalUrl"], text(value["normalizedUrl"], "unknown"));
  const reference = referenceFrom(value);
  if (reference === null) return missing("html-page", requestId, url);
  try {
    assertComplete(reference);
    const bytes = await evidence.read(reference);
    const decoded = decodeBody(bytes, reference.mediaType, "html", {
      kind: "replacement",
    });
    const extracted = extractHtmlFacts(decoded.text, url, config, {
      encoding: decoded.encoding,
      xRobotsTag: xRobotsTagFromFacts(value["facts"]),
    });
    const validLinkCount = validHtmlLinkCandidates(extracted.links, url).length;
    const replayedFacts = addLinkTruncationWarning(
      extracted.facts,
      Math.max(0, validLinkCount - config.limits.maxDiscoveredLinksPerPage),
    );
    return compared(
      "html-page",
      requestId,
      url,
      replayableHtml(value["facts"]),
      replayableHtml(replayedFacts),
      reference.digest,
    );
  } catch (caught) {
    return failed(
      "html-page",
      requestId,
      url,
      message(caught),
      reference.digest,
    );
  }
}

async function replayXml(
  value: unknown,
  config: ReturnType<typeof replayConfig>,
  evidence: ContentAddressedEvidenceStore,
): Promise<ReplayItem> {
  if (!isRecord(value))
    return failed(
      "xml-resource",
      "unknown",
      "unknown",
      "XML record is invalid.",
    );
  const requestId = text(value["requestId"], "unknown");
  const url = text(value["finalUrl"], text(value["normalizedUrl"], "unknown"));
  const reference = referenceFrom(value);
  if (reference === null) return missing("xml-resource", requestId, url);
  try {
    assertComplete(reference);
    const bytes = await evidence.read(reference);
    const decoded = decodeBody(bytes, reference.mediaType, "xml", {
      kind: "fatal",
    });
    const extracted = extractXmlResource({
      runId: text(value["runId"], "replay"),
      requestId,
      resourceId: text(value["resourceId"], requestId),
      requestedUrl: text(value["requestedUrl"], url),
      finalUrl: url,
      normalizedUrl: text(value["normalizedUrl"], url),
      encoding: decoded.encoding,
      evidence: reference,
      decodingWarnings: decoded.warnings,
      config,
      xml: decoded.text,
    });
    return compared(
      "xml-resource",
      requestId,
      url,
      replayableXml(value),
      replayableXml(extracted),
      reference.digest,
    );
  } catch (caught) {
    return failed(
      "xml-resource",
      requestId,
      url,
      message(caught),
      reference.digest,
    );
  }
}

function referenceFrom(value: Readonly<Record<string, unknown>>) {
  try {
    return value["evidence"] === null || value["evidence"] === undefined
      ? null
      : parseEvidenceReference(value["evidence"]);
  } catch {
    return null;
  }
}

function compared(
  entity: ReplayItem["entity"],
  requestId: string,
  url: string,
  previous: unknown,
  replayed: unknown,
  evidenceDigest: string,
): ReplayItem {
  const previousHash = stableHash(previous);
  const replayedHash = stableHash(replayed);
  return {
    schemaId: "site-crawler.replayItem",
    schemaVersion: 1,
    entity,
    requestId,
    url,
    evidenceDigest,
    status: previousHash === replayedHash ? "matched" : "changed",
    previousHash,
    replayedHash,
    error: null,
  };
}

function missing(
  entity: ReplayItem["entity"],
  requestId: string,
  url: string,
): ReplayItem {
  return {
    schemaId: "site-crawler.replayItem",
    schemaVersion: 1,
    entity,
    requestId,
    url,
    evidenceDigest: null,
    status: "missing-evidence",
    previousHash: null,
    replayedHash: null,
    error: null,
  };
}

function failed(
  entity: ReplayItem["entity"],
  requestId: string,
  url: string,
  error: string,
  evidenceDigest: string | null = null,
): ReplayItem {
  return {
    schemaId: "site-crawler.replayItem",
    schemaVersion: 1,
    entity,
    requestId,
    url,
    evidenceDigest,
    status: "failed",
    previousHash: null,
    replayedHash: null,
    error,
  };
}

function assertComplete(
  reference: ReturnType<typeof parseEvidenceReference>,
): void {
  if (reference.capture.kind !== "complete") {
    throw new Error("Replay requires complete source evidence.");
  }
  if (reference.capture.sourceByteLength !== reference.byteLength) {
    throw new Error("Complete evidence byte lengths do not agree.");
  }
}

function createReport(
  directory: string,
  startedAt: string,
  items: readonly ReplayItem[],
): ReplayReport {
  return {
    schemaId: "site-crawler.replayReport",
    schemaVersion: 1,
    runDirectory: directory,
    crawlerVersion: SITE_CRAWLER_VERSION,
    htmlParserVersion: installedPackageVersion("@ismail-elkorchi/html-parser"),
    xmlParserVersion: installedPackageVersion("@ismail-elkorchi/xml-parser"),
    startedAt,
    finishedAt: new Date().toISOString(),
    matched: items.filter((item) => item.status === "matched").length,
    changed: items.filter((item) => item.status === "changed").length,
    missingEvidence: items.filter((item) => item.status === "missing-evidence")
      .length,
    failed: items.filter((item) => item.status === "failed").length,
    items,
  };
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
