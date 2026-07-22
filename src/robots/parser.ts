import { normalizeUrl } from "../url/index.js";
import type { RobotsGroup, RobotsPolicy, RobotsRule } from "./policy-types.js";
export function parseRobotsTxt(text: string, baseUrl: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let crawlDelaySeconds: number | null = null;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;
    const delimiter = line.indexOf(":");
    if (delimiter < 0) continue;
    const key = line.slice(0, delimiter).trim().toLowerCase();
    const value = line.slice(delimiter + 1).trim();
    if (key === "sitemap") {
      const normalized = normalizeUrl(value, baseUrl);
      if (normalized.ok) sitemaps.push(normalized.value.normalizedUrl);
      continue;
    }
    if (key === "user-agent") {
      if (rules.length > 0 || crawlDelaySeconds !== null) flush();
      if (value.length > 0) agents.push(value.toLowerCase());
      continue;
    }
    if (agents.length === 0) continue;
    if (key === "allow" || key === "disallow") {
      rules.push({ directive: key, path: value });
      continue;
    }
    if (key === "crawl-delay") {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) crawlDelaySeconds = parsed;
    }
  }
  flush();
  return { groups, sitemaps: [...new Set(sitemaps)], unavailableMode: null };
  function flush(): void {
    if (agents.length > 0)
      groups.push({
        agents: [...agents],
        rules: [...rules],
        crawlDelaySeconds,
      });
    agents = [];
    rules = [];
    crawlDelaySeconds = null;
  }
}
function stripComment(line: string): string {
  const index = line.indexOf("#");
  return index < 0 ? line : line.slice(0, index);
}
