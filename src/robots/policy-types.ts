export interface RobotsFetchResult {
  readonly runId: string;
  readonly statusCode: number | null;
  readonly text: string | null;
  readonly finalUrl: string | null;
  readonly error: Error | null;
  readonly fetchedAt: string;
}

export type RobotsFetcher = (robotsUrl: string) => Promise<RobotsFetchResult>;

export interface RobotsRule {
  readonly directive: "allow" | "disallow";
  readonly path: string;
}

export interface RobotsGroup {
  readonly agents: readonly string[];
  readonly rules: readonly RobotsRule[];
  readonly crawlDelaySeconds: number | null;
}

export interface RobotsPolicy {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
  readonly unavailableMode: "allow" | "disallow" | "seed-only" | null;
}
