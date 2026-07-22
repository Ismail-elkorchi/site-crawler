import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
import { globishToRegExp } from "../core/utils.js";
import type { ScopeConfig, ScopeDecision } from "./types.js";
import {
  directoryOf,
  pathPattern,
  pathSegments,
  queryParamCount,
  queryPattern,
} from "./path-pattern.js";

interface CompiledScope {
  readonly config: ScopeConfig;
  readonly seeds: readonly URL[];
  readonly include: readonly RegExp[];
  readonly exclude: readonly RegExp[];
}

export interface ScopeReservation {
  readonly decision: ScopeDecision;
  commit(): void;
}

export class ScopePolicy {
  private readonly global: CompiledScope;
  private readonly bySeed = new Map<string, CompiledScope>();
  private readonly directoryCounts = new Map<string, number>();
  private readonly patternCounts = new Map<string, number>();
  private readonly seeds: readonly ResolvedSeed[];

  public constructor(
    globalConfig: ScopeConfig,
    seeds: readonly ResolvedSeed[],
  ) {
    this.seeds = seeds;
    this.global = compileScope(globalConfig, seeds);
    for (const seed of seeds) {
      this.bySeed.set(seed.normalizedUrl, compileScope(seed.scope, [seed]));
    }
  }

  public decide(
    url: string,
    depth: number,
    seedUrl: string | null = null,
  ): ScopeDecision {
    const seed = this.seedFor(seedUrl);
    const compiled =
      seed === null
        ? this.global
        : (this.bySeed.get(seed.normalizedUrl) ?? this.global);
    if (seed !== null && seed.maxDepth !== null && depth > seed.maxDepth) {
      return denied("Seed depth limit exceeded", "seed.maxDepth");
    }
    return decideWithCompiledScope(url, depth, compiled);
  }

  public prepareReservation(
    url: string,
    seedUrl: string | null,
  ): ScopeReservation {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return noReservation(denied("Invalid URL", "url"));
    }
    const selected = this.compiledFor(seedUrl);
    const directoryKey = `${selected.key}\0${parsed.origin}${directoryOf(parsed.pathname)}`;
    const patternKey = `${selected.key}\0${parsed.origin}${pathPattern(parsed.pathname)}?${queryPattern(parsed)}`;
    const directoryCount = (this.directoryCounts.get(directoryKey) ?? 0) + 1;
    if (directoryCount > selected.scope.config.maxUrlsPerDirectory) {
      return noReservation(
        denied("Directory URL limit exceeded", "maxUrlsPerDirectory"),
      );
    }
    const patternCount = (this.patternCounts.get(patternKey) ?? 0) + 1;
    if (patternCount > selected.scope.config.maxUrlsPerPathPattern) {
      return noReservation(
        denied("Path pattern URL limit exceeded", "maxUrlsPerPathPattern"),
      );
    }
    let committed = false;
    return {
      decision: { allowed: true, reason: null, policyName: null },
      commit: () => {
        if (committed) return;
        committed = true;
        this.directoryCounts.set(directoryKey, directoryCount);
        this.patternCounts.set(patternKey, patternCount);
      },
    };
  }

  public restoreReservations(requests: readonly CrawlRequest[]): void {
    this.directoryCounts.clear();
    this.patternCounts.clear();
    for (const request of requests) {
      let parsed: URL;
      try {
        parsed = new URL(request.normalizedUrl);
      } catch {
        continue;
      }
      const selected = this.compiledFor(request.seedUrl);
      const directoryKey = `${selected.key}\0${parsed.origin}${directoryOf(parsed.pathname)}`;
      const patternKey = `${selected.key}\0${parsed.origin}${pathPattern(parsed.pathname)}?${queryPattern(parsed)}`;
      this.directoryCounts.set(
        directoryKey,
        (this.directoryCounts.get(directoryKey) ?? 0) + 1,
      );
      this.patternCounts.set(
        patternKey,
        (this.patternCounts.get(patternKey) ?? 0) + 1,
      );
    }
  }

  private seedFor(seedUrl: string | null): ResolvedSeed | null {
    if (seedUrl === null) return null;
    return (
      this.seeds.find(
        (candidate) =>
          candidate.normalizedUrl === seedUrl || candidate.url === seedUrl,
      ) ?? null
    );
  }

  private compiledFor(seedUrl: string | null): {
    readonly key: string;
    readonly scope: CompiledScope;
  } {
    const seed = this.seedFor(seedUrl);
    if (seed === null) return { key: "global", scope: this.global };
    return {
      key: seed.normalizedUrl,
      scope: this.bySeed.get(seed.normalizedUrl) ?? this.global,
    };
  }
}

function noReservation(decision: ScopeDecision): ScopeReservation {
  return { decision, commit: () => undefined };
}

function compileScope(
  config: ScopeConfig,
  seeds: readonly ResolvedSeed[],
): CompiledScope {
  return {
    config,
    seeds: seeds.map((seed) => new URL(seed.normalizedUrl)),
    include: config.include.map(globishToRegExp),
    exclude: config.exclude.map(globishToRegExp),
  };
}

function decideWithCompiledScope(
  url: string,
  depth: number,
  scope: CompiledScope,
): ScopeDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return denied("Invalid URL", "url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return denied(`Unsupported protocol ${parsed.protocol}`, "protocol");
  }
  if (url.length > scope.config.maxUrlLength) {
    return denied("URL length exceeds maximum", "maxUrlLength");
  }
  if (pathSegments(parsed) > scope.config.maxPathSegments) {
    return denied("Path segment count exceeds maximum", "maxPathSegments");
  }
  if (queryParamCount(parsed) > scope.config.maxQueryParams) {
    return denied("Query parameter count exceeds maximum", "maxQueryParams");
  }
  if (scope.config.deniedHosts.includes(parsed.hostname)) {
    return denied("Host is explicitly denied", "deniedHosts");
  }
  if (
    scope.config.allowedHosts.length > 0 &&
    !scope.config.allowedHosts.includes(parsed.hostname)
  ) {
    return denied("Host is not explicitly allowed", "allowedHosts");
  }
  if (scope.exclude.some((pattern) => pattern.test(url))) {
    return denied("URL matched exclude pattern", "exclude");
  }
  if (
    scope.include.length > 0 &&
    !scope.include.some((pattern) => pattern.test(url))
  ) {
    return denied("URL did not match include pattern", "include");
  }
  if (!inScope(parsed, scope)) {
    return denied(`URL is outside ${scope.config.mode} scope`, "scope");
  }
  if (depth < 0) return denied("Negative depth", "depth");
  return { allowed: true, reason: null, policyName: null };
}

function inScope(url: URL, scope: CompiledScope): boolean {
  switch (scope.config.mode) {
    case "origin":
      return scope.seeds.some((seed) => seed.origin === url.origin);
    case "host":
      return scope.seeds.some((seed) => seed.hostname === url.hostname);
    case "domain":
      return scope.seeds.some(
        (seed) =>
          url.hostname === seed.hostname ||
          url.hostname.endsWith(`.${seed.hostname}`),
      );
    case "custom":
      return (
        scope.config.allowedHosts.length === 0 ||
        scope.config.allowedHosts.includes(url.hostname)
      );
  }
}

function denied(reason: string, policyName: string): ScopeDecision {
  return { allowed: false, reason, policyName };
}
