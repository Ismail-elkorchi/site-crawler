import type { SQLOutputValue } from "node:sqlite";
import { parseCrawlRequest } from "../../requests/parse.js";
import type { CrawlRequest } from "../../requests/types.js";

export function requestFromRow(
  row: Readonly<Record<string, SQLOutputValue>> | undefined,
): CrawlRequest | null {
  if (row === undefined) return null;
  const json = row["request_json"];
  if (typeof json !== "string")
    throw new Error("Frontier request row is malformed.");
  return parseCrawlRequest(JSON.parse(json));
}

export function integerFromRow(
  row: Readonly<Record<string, SQLOutputValue>> | undefined,
  name: string,
): number {
  const value = row?.[name];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error(`SQLite row field '${name}' is not an integer.`);
}

export function nullableIntegerFromRow(
  row: Readonly<Record<string, SQLOutputValue>> | undefined,
  name: string,
): number | null {
  const value = row?.[name];
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error(`SQLite row field '${name}' is not an integer.`);
}

export function stringFromRow(
  row: Readonly<Record<string, SQLOutputValue>>,
  name: string,
): string {
  const value = row[name];
  if (typeof value !== "string")
    throw new Error(`SQLite row field '${name}' is not a string.`);
  return value;
}
