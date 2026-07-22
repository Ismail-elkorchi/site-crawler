import { parseCrawlConfig } from "../../config/input/parse-config.js";
import { parseEvidenceReference } from "../../evidence/parse.js";
import { parseWorkerMessage } from "../../workers/protocol.js";
import { isRecord } from "../object-contract.js";
import { predicateContract } from "../predicate-contract.js";
import type { JsonSchema, RuntimeContract } from "../types.js";

export const predicateContracts: readonly RuntimeContract[] = [
  predicateContract({
    name: "evidence-reference",
    schemaId: "site-crawler.evidenceReference",
    schemaVersion: 1,
    schema: evidenceReferenceSchema(),
    is(value) {
      try {
        parseEvidenceReference(value);
        return true;
      } catch {
        return false;
      }
    },
    parse(value) {
      return parseEvidenceReference(value);
    },
  }),
  predicateContract({
    name: "crawl-config",
    schemaId: "site-crawler.config",
    schemaVersion: 1,
    schema: objectSchema("crawl-config", ["seeds"]),
    is(value) {
      try {
        parseCrawlConfig(value);
        return true;
      } catch {
        return false;
      }
    },
    parse(value) {
      return parseCrawlConfig(value);
    },
  }),
  predicateContract({
    name: "resolved-crawl-config",
    schemaId: "site-crawler.resolvedConfig",
    schemaVersion: 1,
    schema: versionedObjectSchema(
      "resolved-crawl-config",
      "site-crawler.resolvedConfig",
      [
        "seeds",
        "seedUrls",
        "scope",
        "limits",
        "networkSafety",
        "robots",
        "sitemaps",
        "feeds",
        "jsDiscovery",
        "cssDiscovery",
        "network",
        "session",
        "httpCache",
        "responseLimits",
        "parsing",
        "rendering",
        "storage",
        "output",
      ],
    ),
    is: isResolvedConfig,
    parse(value) {
      if (!isResolvedConfig(value)) {
        throw new TypeError("resolved-crawl-config is malformed.");
      }
      return value;
    },
  }),
  predicateContract({
    name: "crawl-event",
    schemaId: "site-crawler.event",
    schemaVersion: 1,
    schema: objectSchema("crawl-event", ["type", "runId", "createdAt"]),
    is: isCrawlEvent,
    parse(value) {
      if (!isCrawlEvent(value))
        throw new TypeError("crawl-event is malformed.");
      return value;
    },
  }),
  predicateContract({
    name: "worker-protocol-message",
    schemaId: "site-crawler.worker",
    schemaVersion: 1,
    schema: objectSchema("worker-protocol-message", [
      "protocolVersion",
      "type",
      "workerId",
      "runId",
      "sentAt",
    ]),
    is(value) {
      try {
        parseWorkerMessage(value);
        return true;
      } catch {
        return false;
      }
    },
    parse(value) {
      return parseWorkerMessage(value);
    },
  }),
];

function isResolvedConfig(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const arrayFields = ["seeds", "seedUrls"] as const;
  const objectFields = [
    "scope",
    "limits",
    "networkSafety",
    "robots",
    "sitemaps",
    "feeds",
    "jsDiscovery",
    "cssDiscovery",
    "network",
    "session",
    "httpCache",
    "responseLimits",
    "parsing",
    "rendering",
    "storage",
    "output",
  ] as const;
  const allowed = new Set([
    "schemaId",
    "schemaVersion",
    ...arrayFields,
    ...objectFields,
  ]);
  return (
    value["schemaId"] === "site-crawler.resolvedConfig" &&
    value["schemaVersion"] === 1 &&
    Object.keys(value).every((key) => allowed.has(key)) &&
    arrayFields.every((key) => Array.isArray(value[key])) &&
    objectFields.every((key) => isRecord(value[key]))
  );
}

function isCrawlEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value["type"] === "string" &&
    typeof value["runId"] === "string" &&
    typeof value["createdAt"] === "string"
  );
}

function objectSchema(title: string, required: readonly string[]): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title,
    type: "object",
    required,
    additionalProperties: true,
  };
}

function versionedObjectSchema(
  title: string,
  schemaId: string,
  fields: readonly string[],
): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title,
    type: "object",
    required: ["schemaId", "schemaVersion", ...fields],
    properties: Object.fromEntries([
      ["schemaId", { const: schemaId }],
      ["schemaVersion", { const: 1 }],
      ...fields.map((field) => [field, {}]),
    ]),
    additionalProperties: false,
  };
}

function evidenceReferenceSchema(): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "evidence-reference",
    type: "object",
    required: [
      "schemaId",
      "schemaVersion",
      "algorithm",
      "digest",
      "kind",
      "mediaType",
      "byteLength",
      "capture",
      "relativePath",
      "createdAt",
    ],
    properties: {
      schemaId: { const: "site-crawler.evidenceReference" },
      schemaVersion: { const: 1 },
      algorithm: { const: "sha256" },
      digest: { type: "string", pattern: "^[0-9a-f]{64}$" },
      kind: { enum: ["html", "xml", "rendered-html"] },
      mediaType: { type: "string" },
      byteLength: { type: "integer", minimum: 0 },
      capture: {
        oneOf: [
          {
            type: "object",
            required: ["kind", "sourceByteLength"],
            properties: {
              kind: { const: "complete" },
              sourceByteLength: { type: "integer", minimum: 0 },
            },
            additionalProperties: false,
          },
          {
            type: "object",
            required: ["kind", "sourceByteLength", "limitBytes"],
            properties: {
              kind: { const: "truncated" },
              sourceByteLength: {
                type: ["integer", "null"],
                minimum: 0,
              },
              limitBytes: { type: "integer", minimum: 0 },
            },
            additionalProperties: false,
          },
        ],
      },
      relativePath: { type: "string" },
      createdAt: { type: "string" },
    },
    additionalProperties: false,
  };
}
