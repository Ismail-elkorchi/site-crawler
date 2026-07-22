import {
  createConfigFingerprints,
  resolveConfig,
  validateConfig,
  type ConfigFingerprints,
} from "../config/index.js";
import type { CrawlConfig, ResolvedCrawlConfig } from "../config/types.js";
import { installedPackageVersion } from "../core/dependency-version.js";
import { makeId, nowIso } from "../core/utils.js";
import { resolveExtensions } from "../extensions/index.js";
import type {
  CrawlerExtensions,
  ResolvedCrawlerExtensions,
} from "../extensions/types.js";
import { readResumeState } from "./resume.js";
import { zeroCounters } from "./run-records.js";
import type { CrawlCounters } from "./types.js";

export interface RuntimeIdentity {
  readonly config: ResolvedCrawlConfig;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly fingerprints: ConfigFingerprints;
  readonly runId: string;
  readonly startedAt: string;
  readonly counters: CrawlCounters;
  readonly htmlParserVersion: string | null;
  readonly xmlParserVersion: string | null;
}

export function createRuntimeIdentity(
  input: CrawlConfig,
  runtimeExtensions: CrawlerExtensions | undefined,
): RuntimeIdentity {
  const config = resolveConfig(input);
  const extensions = resolveExtensions(runtimeExtensions);
  validateConfig(config, extensions);
  const fingerprints = createConfigFingerprints(config);
  const resume =
    config.storage.resumeFrom === null
      ? null
      : readResumeState(
          config.storage.resumeFrom,
          fingerprints,
          config.storage.resumePolicy,
        );
  return {
    config,
    extensions,
    fingerprints,
    runId:
      resume?.manifest.runId ??
      makeId("run", `${Date.now()}:${config.seedUrls.join("|")}`),
    startedAt: resume?.manifest.startedAt ?? nowIso(),
    counters: resume?.counters ?? zeroCounters(),
    htmlParserVersion: installedPackageVersion("@ismail-elkorchi/html-parser"),
    xmlParserVersion: installedPackageVersion("@ismail-elkorchi/xml-parser"),
  };
}
