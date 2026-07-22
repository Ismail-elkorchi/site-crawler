import type { ScopeMode } from "../url/types.js";

export interface CrawlCliOptions {
  readonly command: "crawl";
  readonly seed: string | null;
  readonly configPath: string | null;
  readonly out: string | null;
  readonly maxScheduledRequests: number | null;
  readonly maxFetchedResources: number | null;
  readonly maxDepth: number | null;
  readonly scope: ScopeMode | null;
  readonly respectRobots: boolean | null;
  readonly discoverSitemaps: boolean | null;
  readonly quiet: boolean;
}

export interface RunDirectoryCommand {
  readonly runDirectory: string;
  readonly quiet: boolean;
}

export type CliCommand =
  | CrawlCliOptions
  | ({ readonly command: "resume" } & RunDirectoryCommand)
  | ({
      readonly command: "abort";
      readonly reason: string;
    } & RunDirectoryCommand)
  | ({ readonly command: "inspect" } & RunDirectoryCommand)
  | ({ readonly command: "validate-run" } & RunDirectoryCommand)
  | ({ readonly command: "compact" } & RunDirectoryCommand)
  | ({ readonly command: "checkpoint" } & RunDirectoryCommand)
  | ({
      readonly command: "replay";
      readonly out: string | null;
    } & RunDirectoryCommand)
  | ({
      readonly command: "evidence-bundle";
      readonly out: string | null;
      readonly gzip: boolean;
    } & RunDirectoryCommand)
  | ({ readonly command: "export"; readonly out: string } & RunDirectoryCommand)
  | {
      readonly command: "compare";
      readonly baseDirectory: string;
      readonly targetDirectory: string;
      readonly out: string | null;
      readonly quiet: boolean;
    }
  | {
      readonly command: "validate-config";
      readonly configPath: string;
      readonly quiet: boolean;
    }
  | { readonly command: "doctor"; readonly quiet: boolean }
  | { readonly command: "help"; readonly quiet: boolean };
