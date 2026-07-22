import type { ResolvedSeed } from "../requests/types.js";
import {
  nullableNumber,
  nullableString,
  numberField,
  record,
  stringArray,
  stringField,
} from "../validation/primitives.js";

export function parseSeeds(value: unknown): readonly ResolvedSeed[] {
  if (!Array.isArray(value)) throw new Error("Resume seeds are malformed.");
  return value.map(parseSeed);
}

function parseSeed(value: unknown): ResolvedSeed {
  const seed = record(value, "seed");
  const scope = record(seed["scope"], "seed scope");
  return {
    url: stringField(seed, "url"),
    normalizedUrl: stringField(seed, "normalizedUrl"),
    scope: {
      mode: parseScopeMode(scope["mode"]),
      include: stringArray(scope["include"], "scope.include"),
      exclude: stringArray(scope["exclude"], "scope.exclude"),
      allowedHosts: stringArray(scope["allowedHosts"], "scope.allowedHosts"),
      deniedHosts: stringArray(scope["deniedHosts"], "scope.deniedHosts"),
      maxUrlLength: numberField(scope, "maxUrlLength"),
      maxPathSegments: numberField(scope, "maxPathSegments"),
      maxQueryParams: numberField(scope, "maxQueryParams"),
      maxUrlsPerDirectory: numberField(scope, "maxUrlsPerDirectory"),
      maxUrlsPerPathPattern: numberField(scope, "maxUrlsPerPathPattern"),
    },
    maxDepth: nullableNumber(seed, "maxDepth"),
    maxScheduledRequests: nullableNumber(seed, "maxScheduledRequests"),
    label: nullableString(seed, "label"),
  };
}

function parseScopeMode(value: unknown): ResolvedSeed["scope"]["mode"] {
  if (
    value === "origin" ||
    value === "host" ||
    value === "domain" ||
    value === "custom"
  ) {
    return value;
  }
  throw new Error("Resume scope mode is malformed.");
}
