import fs from "node:fs/promises";
import path from "node:path";
import { writePrivateFileAtomic } from "../core/private-files.js";
import { validatePersistedRecord } from "../contracts/catalog.js";

export interface AbortRequest {
  readonly schemaId: "site-crawler.abortRequest";
  readonly schemaVersion: 1;
  readonly runId: string | null;
  readonly reason: string;
  readonly requestedAt: string;
}

export async function requestRunAbort(
  runDirectory: string,
  reason = "Abort requested from the CLI",
): Promise<AbortRequest> {
  const directory = path.resolve(runDirectory);
  const request: AbortRequest = {
    schemaId: "site-crawler.abortRequest",
    schemaVersion: 1,
    runId: await runId(directory),
    reason,
    requestedAt: new Date().toISOString(),
  };
  validatePersistedRecord(request);
  const target = path.join(directory, "abort.request.json");
  await writePrivateFileAtomic(
    target,
    `${JSON.stringify(request, null, 2)}\n`,
    false,
  );
  return request;
}

async function runId(directory: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(directory, "manifest.json"), "utf8"),
    );
    if (!isRecord(parsed)) return null;
    return typeof parsed["runId"] === "string" ? parsed["runId"] : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
