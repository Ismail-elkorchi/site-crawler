import path from "node:path";
import type { ResolvedCrawlConfig } from "../../config/types.js";
import type { SessionConfig } from "./types.js";

export function resolveSessionConfig(
  config: ResolvedCrawlConfig,
  runId: string,
): SessionConfig {
  if (!config.session.persistCookies) return config.session;
  const runDirectory = resolveRunDirectory(config, runId);
  const relative =
    config.session.cookieFile ?? path.join("session", "cookies.json");
  if (path.isAbsolute(relative)) {
    throw new Error(
      "session.cookieFile must be relative to the run directory.",
    );
  }
  const cookieFile = path.resolve(runDirectory, relative);
  assertInsideRunDirectory(runDirectory, cookieFile);
  return { ...config.session, cookieFile };
}

function resolveRunDirectory(
  config: ResolvedCrawlConfig,
  runId: string,
): string {
  if (config.storage.type === "memory") {
    throw new Error(
      "Persistent cookies require filesystem-backed crawl storage.",
    );
  }
  return path.resolve(
    config.storage.resumeFrom ?? path.join(config.storage.directory, runId),
  );
}

function assertInsideRunDirectory(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative === "") {
    throw new Error(
      "session.cookieFile must name a file inside the run directory.",
    );
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("session.cookieFile must remain inside the run directory.");
  }
}
