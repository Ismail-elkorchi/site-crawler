import type { CliCommand, CrawlCliOptions } from "./types.js";

export function parseArgs(argv: readonly string[]): CliCommand {
  const command = argv[0] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    return { command: "help", quiet: false };
  }
  if (command === "crawl") return parseCrawl(argv.slice(1));
  if (command === "doctor")
    return { command: "doctor", quiet: hasFlag(argv, "--quiet") };
  if (command === "validate-config") {
    return {
      command,
      configPath: positional(argv, 1, "configuration file"),
      quiet: hasFlag(argv, "--quiet"),
    };
  }
  if (command === "compare") {
    return {
      command,
      baseDirectory: positional(argv, 1, "base run directory"),
      targetDirectory: positional(argv, 2, "target run directory"),
      out: optionalFlagValue(argv, "--out"),
      quiet: hasFlag(argv, "--quiet"),
    };
  }
  const runDirectory = positional(argv, 1, "run directory");
  const quiet = hasFlag(argv, "--quiet");
  if (
    command === "resume" ||
    command === "inspect" ||
    command === "validate-run" ||
    command === "compact" ||
    command === "checkpoint"
  ) {
    return { command, runDirectory, quiet };
  }
  if (command === "abort") {
    return {
      command,
      runDirectory,
      quiet,
      reason:
        optionalFlagValue(argv, "--reason") ?? "Abort requested from the CLI",
    };
  }
  if (command === "replay")
    return {
      command,
      runDirectory,
      quiet,
      out: optionalFlagValue(argv, "--out"),
    };
  if (command === "evidence-bundle") {
    return {
      command,
      runDirectory,
      quiet,
      out: optionalFlagValue(argv, "--out"),
      gzip: hasFlag(argv, "--gzip"),
    };
  }
  if (command === "export") {
    const out = optionalFlagValue(argv, "--out");
    if (out === null) throw new Error("export requires --out DIR.");
    return { command, runDirectory, quiet, out };
  }
  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

function parseCrawl(argv: readonly string[]): CrawlCliOptions {
  const state: MutableCrawl = {
    seed: null,
    configPath: null,
    out: null,
    maxScheduledRequests: null,
    maxFetchedResources: null,
    maxDepth: null,
    scope: null,
    respectRobots: null,
    discoverSitemaps: null,
    quiet: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (!arg.startsWith("--") && state.seed === null) {
      state.seed = arg;
      continue;
    }
    index = parseCrawlFlag(argv, index, arg, state);
  }
  return { command: "crawl", ...state };
}

type MutableCrawl = {
  -readonly [Key in keyof Omit<CrawlCliOptions, "command">]: Omit<
    CrawlCliOptions,
    "command"
  >[Key];
};

function parseCrawlFlag(
  argv: readonly string[],
  index: number,
  arg: string,
  state: MutableCrawl,
): number {
  if (arg === "--config") state.configPath = requiredValue(argv, ++index, arg);
  else if (arg === "--out") state.out = requiredValue(argv, ++index, arg);
  else if (arg === "--max-scheduled-requests")
    state.maxScheduledRequests = positive(
      requiredValue(argv, ++index, arg),
      arg,
    );
  else if (arg === "--max-fetched-resources")
    state.maxFetchedResources = positive(
      requiredValue(argv, ++index, arg),
      arg,
    );
  else if (arg === "--max-depth")
    state.maxDepth = nonNegative(requiredValue(argv, ++index, arg), arg);
  else if (arg === "--scope")
    state.scope = parseScope(requiredValue(argv, ++index, arg));
  else if (arg === "--respect-robots") state.respectRobots = true;
  else if (arg === "--ignore-robots") state.respectRobots = false;
  else if (arg === "--discover-sitemaps") state.discoverSitemaps = true;
  else if (arg === "--no-discover-sitemaps") state.discoverSitemaps = false;
  else if (arg === "--quiet") state.quiet = true;
  else throw new Error(`Unknown crawl argument: ${arg}`);
  return index;
}

function positional(
  argv: readonly string[],
  index: number,
  description: string,
): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`A ${description} is required.`);
  return value;
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function optionalFlagValue(
  argv: readonly string[],
  flag: string,
): string | null {
  const index = argv.indexOf(flag);
  return index < 0 ? null : requiredValue(argv, index + 1, flag);
}

function requiredValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`${flag} requires a value.`);
  return value;
}

function positive(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${flag} expects a positive integer.`);
  return value;
}

function nonNegative(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${flag} expects a non-negative integer.`);
  return value;
}

function parseScope(raw: string): NonNullable<CrawlCliOptions["scope"]> {
  if (
    raw === "origin" ||
    raw === "host" ||
    raw === "domain" ||
    raw === "custom"
  )
    return raw;
  throw new Error("--scope must be origin, host, domain, or custom.");
}

export function usage(): string {
  return [
    "site-crawler commands:",
    "  crawl <url> [--config FILE] [--out DIR]",
    "  resume <run-dir>",
    "  abort <run-dir> [--reason TEXT]",
    "  inspect <run-dir>",
    "  validate-config <config.json>",
    "  validate-run <run-dir>",
    "  compact <run-dir>",
    "  checkpoint <run-dir>",
    "  export <run-dir> --out DIR",
    "  replay <run-dir> [--out FILE]",
    "  compare <base-run> <target-run> [--out FILE]",
    "  evidence-bundle <run-dir> [--out DIR] [--gzip]",
    "  doctor",
  ].join("\n");
}
