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
  const entries: unknown[] = [];
  for (const item of value) {
    const entry: unknown = item;
    if (!isRecord(entry)) {
      entries.push(entry);
      continue;
    }
    const semantic = { ...entry };
    delete semantic["runId"];
    delete semantic["discoveredAt"];
    semantic["warnings"] = replayableWarnings(entry["warnings"]);
    entries.push(semantic);
  }
  return entries;
}

function replayableWarnings(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const warnings: unknown[] = [];
  for (const item of value) {
    const entry: unknown = item;
    if (!isRecord(entry)) {
      warnings.push(entry);
      continue;
    }
    const warning = { ...entry };
    delete warning["createdAt"];
    warnings.push(warning);
  }
  return warnings;
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
