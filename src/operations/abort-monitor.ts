import fs from "node:fs/promises";
import path from "node:path";
import { hasCurrentSchema } from "../contracts/schema-identity.js";
import type { AbortRequest } from "./abort.js";

export class AbortRequestMonitor {
  private readonly filePath: string;
  private readonly runId: string;
  private readonly onAbort: (reason: string) => void;
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    runDirectory: string,
    runId: string,
    onAbort: (reason: string) => void,
  ) {
    this.filePath = path.join(runDirectory, "abort.request.json");
    this.runId = runId;
    this.onAbort = onAbort;
  }

  public start(intervalMs = 250): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  public stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    try {
      const value: unknown = JSON.parse(
        await fs.readFile(this.filePath, "utf8"),
      );
      const request = parseAbortRequest(value);
      if (request.runId === null || request.runId === this.runId) {
        await fs.rm(this.filePath, { force: true });
        this.onAbort(request.reason);
      }
    } catch (caught) {
      if (!isMissing(caught)) return;
    }
  }
}

function parseAbortRequest(value: unknown): AbortRequest {
  if (!isRecord(value)) throw new Error("Abort request must be an object.");
  const allowed = new Set([
    "schemaId",
    "schemaVersion",
    "runId",
    "reason",
    "requestedAt",
  ]);
  if (
    !hasCurrentSchema(value, "site-crawler.abortRequest") ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new Error("Abort request contract is unsupported.");
  }
  const runId = value["runId"];
  const reason = value["reason"];
  const requestedAt = value["requestedAt"];
  if (runId !== null && typeof runId !== "string")
    throw new Error("Abort run ID is malformed.");
  if (typeof reason !== "string" || typeof requestedAt !== "string") {
    throw new Error("Abort request is malformed.");
  }
  return {
    schemaId: "site-crawler.abortRequest",
    schemaVersion: 1,
    runId,
    reason,
    requestedAt,
  };
}

function isMissing(value: unknown): boolean {
  return isRecord(value) && value["code"] === "ENOENT";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
