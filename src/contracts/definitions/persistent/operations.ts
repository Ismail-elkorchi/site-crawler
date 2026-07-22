import type { ObjectContractOptions } from "../../object-contract.js";
import { definition } from "./definition.js";

export const operationsDefinitions: readonly ObjectContractOptions[] = [
  definition("abort-request", "site-crawler.abortRequest", {
    strings: ["reason", "requestedAt"],
    nullableStrings: ["runId"],
  }),
  definition("export-report", "site-crawler.exportReport", {
    strings: ["sourceDirectory", "targetDirectory", "exportedAt"],
    objects: ["counts"],
  }),
  definition("worker-record", "site-crawler.workerRecord", {
    strings: [
      "workerId",
      "runId",
      "host",
      "protocolVersion",
      "startedAt",
      "heartbeatAt",
      "status",
    ],
    numbers: ["pid"],
  }),
  definition("checkpoint", "site-crawler.checkpoint", {
    strings: ["runId", "createdAt", "frontierBackend"],
    numbers: ["sequence"],
    objects: ["counts"],
  }),
  definition("run-format", "site-crawler.runFormat", {
    strings: ["runId", "formatVersion", "workerProtocol", "createdAt"],
    numbers: ["schemaSetVersion"],
  }),
  definition("security-audit", "site-crawler.securityAudit", {
    strings: ["runId", "createdAt", "status"],
    numbers: ["issueCount"],
    arrays: ["issues"],
  }),
  definition("run-inspection", "site-crawler.runInspection", {
    strings: ["runId", "directory", "createdAt"],
    objects: ["manifest", "counts"],
    arrays: ["files"],
  }),
  definition("run-validation", "site-crawler.runValidation", {
    strings: ["directory", "createdAt"],
    numbers: ["errorCount", "warningCount"],
    booleans: ["valid"],
    arrays: ["issues"],
  }),
];
