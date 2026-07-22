import type { ObjectContractOptions } from "../../object-contract.js";
import { definition } from "./definition.js";

export const evidenceDefinitions: readonly ObjectContractOptions[] = [
  definition("evidence-association", "site-crawler.evidenceAssociation", {
    strings: ["requestId", "recordedAt"],
    objects: ["reference"],
  }),
  definition("evidence-bundle", "site-crawler.evidenceBundle", {
    strings: ["runId", "createdAt", "sourceDirectory"],
    numbers: ["objectCount", "totalBytes", "storedBytes"],
    booleans: ["compressed"],
    arrays: ["files"],
  }),
  definition("replay-report", "site-crawler.replayReport", {
    strings: ["runDirectory", "crawlerVersion", "startedAt", "finishedAt"],
    numbers: ["matched", "changed", "missingEvidence", "failed"],
    arrays: ["items"],
    nullableStrings: ["htmlParserVersion", "xmlParserVersion"],
  }),
  definition("replay-item", "site-crawler.replayItem", {
    strings: ["entity", "requestId", "url", "status"],
    nullableStrings: [
      "evidenceDigest",
      "previousHash",
      "replayedHash",
      "error",
    ],
  }),
  definition("crawl-change", "site-crawler.change", {
    strings: ["id", "entity", "kind", "key", "detectedAt"],
    unknowns: ["before", "after"],
  }),
  definition("crawl-diff-report", "site-crawler.diffReport", {
    strings: ["baseRunDirectory", "targetRunDirectory", "createdAt"],
    objects: ["summary"],
    arrays: ["changes"],
  }),
];
