import { createHash } from "node:crypto";

export function xRobotsTagFromFacts(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value["xRobotsTag"])) return null;
  const values = value["xRobotsTag"].flatMap((item) =>
    isRecord(item) && typeof item["raw"] === "string" ? [item["raw"]] : [],
  );
  return values.length === 0 ? null : values.join(", ");
}

export function replayableHtml(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    warnings: replayableWarnings(value["warnings"]),
  };
}

export function replayableXml(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    xmlKind: value["xmlKind"],
    rootName: value["rootName"],
    namespaces: value["namespaces"],
    encoding: value["encoding"],
    parseStatus: value["parseStatus"],
    sitemapEntries: replayableEntries(value["sitemapEntries"]),
    feedEntries: replayableEntries(value["feedEntries"]),
    warnings: replayableWarnings(value["warnings"]),
    parserDiagnostics: value["parserDiagnostics"],
    parserBudgets: value["parserBudgets"],
  };
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function replayableEntries(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!isRecord(entry)) return entry;
    const {
      runId: _runId,
      discoveredAt: _discoveredAt,
      warnings,
      ...semantic
    } = entry;
    return { ...semantic, warnings: replayableWarnings(warnings) };
  });
}

function replayableWarnings(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!isRecord(item)) return item;
    const { createdAt: _createdAt, ...warning } = item;
    return warning;
  });
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
