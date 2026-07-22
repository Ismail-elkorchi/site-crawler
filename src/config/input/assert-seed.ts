import type { CrawlSeedInput } from "../../requests/types.js";
import { assertScopeConfig } from "./assert-discovery.js";
import {
  assertInteger,
  assertKnownKeys,
  assertRecord,
  assertString,
  optional,
} from "./assert-utils.js";

export function assertSeeds(
  value: unknown,
  name: string,
): asserts value is readonly CrawlSeedInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty array.`);
  }
  for (const seed of value) assertSeed(seed, `${name}[]`);
}

function assertSeed(value: unknown, name: string): void {
  if (typeof value === "string") return;
  assertRecord(value, name);
  assertKnownKeys(
    value,
    ["url", "scope", "maxDepth", "maxScheduledRequests", "label"],
    name,
  );
  assertString(value["url"], `${name}.url`);
  optional(value, "scope", assertScopeConfig, name);
  optional(value, "maxDepth", assertInteger, name);
  optional(value, "maxScheduledRequests", assertInteger, name);
  optional(value, "label", assertString, name);
}
