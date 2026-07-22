import { SiteCrawler } from "../crawler/SiteCrawler.js";
import { compareRuns } from "../diff/public.js";
import { createEvidenceBundle } from "../evidence/public.js";
import {
  checkpointRun,
  compactRun,
  configForResume,
  doctor,
  exportRun,
  inspectRun,
  requestRunAbort,
  validateConfigFile,
  validateRun,
} from "../operations/public.js";
import { replayRun } from "../replay/public.js";
import type { CrawlResult } from "../results/types.js";
import { buildConfig } from "./config.js";
import { installSignalHandlers } from "./signals.js";
import type { CliCommand, CrawlCliOptions } from "./types.js";

export async function runCommand(command: CliCommand): Promise<CommandResult> {
  if (command.command === "help") return { exitCode: 0, value: null };
  if (command.command === "crawl") return await runCrawler(command);
  if (command.command === "resume") {
    return await runCrawlerWithConfig(
      await configForResume(command.runDirectory),
    );
  }
  if (command.command === "abort")
    return success(await requestRunAbort(command.runDirectory, command.reason));
  if (command.command === "inspect")
    return success(await inspectRun(command.runDirectory));
  if (command.command === "validate-run") {
    const report = await validateRun(command.runDirectory);
    return { exitCode: report.valid ? 0 : 2, value: report };
  }
  if (command.command === "validate-config") {
    const report = await validateConfigFile(command.configPath);
    return { exitCode: report.valid ? 0 : 1, value: report };
  }
  if (command.command === "compact")
    return success(await compactRun(command.runDirectory));
  if (command.command === "checkpoint")
    return success(await checkpointRun(command.runDirectory));
  if (command.command === "export")
    return success(await exportRun(command.runDirectory, command.out));
  if (command.command === "replay")
    return success(
      await replayRun(
        command.runDirectory,
        command.out === null ? {} : { outputPath: command.out },
      ),
    );
  if (command.command === "compare")
    return success(
      await compareRuns(
        command.baseDirectory,
        command.targetDirectory,
        command.out === null ? {} : { outputPath: command.out },
      ),
    );
  if (command.command === "evidence-bundle") {
    return success(
      await createEvidenceBundle(command.runDirectory, {
        ...(command.out === null ? {} : { targetDirectory: command.out }),
        compressObjects: command.gzip,
      }),
    );
  }
  return success(await doctor());
}

export interface CommandResult {
  readonly exitCode: number;
  readonly value: unknown;
}

async function runCrawler(options: CrawlCliOptions): Promise<CommandResult> {
  return await runCrawlerWithConfig(await buildConfig(options));
}

async function runCrawlerWithConfig(
  config: ConstructorParameters<typeof SiteCrawler>[0],
): Promise<CommandResult> {
  const crawler = new SiteCrawler(config);
  const remove = installSignalHandlers(crawler);
  const result = await crawler.run().finally(remove);
  return { exitCode: exitCodeForRun(result), value: result };
}

function exitCodeForRun(result: CrawlResult): number {
  if (result.status === "failed") return 2;
  if (result.status === "aborted") return 4;
  return 0;
}

function success(value: unknown): CommandResult {
  return { exitCode: 0, value };
}
