import type { RobotsGroup, RobotsPolicy, RobotsRule } from "./policy-types.js";
import type { RobotsDecision } from "./types.js";

export function decisionForPath(
  policy: RobotsPolicy,
  productToken: string,
  path: string,
  isSeed = false,
): RobotsDecision {
  if (policy.unavailableMode !== null) {
    return decisionFromFallback(policy.unavailableMode, isSeed);
  }
  const normalizedPath = normalizeRobotsValue(path, false);
  const match = bestRule(matchingRules(policy, productToken), normalizedPath);
  if (match === null) return allowedDecision("robots.txt", null);
  if (match.directive === "allow") {
    return allowedDecision("robots.txt", `Allow: ${match.path}`);
  }
  return {
    allowed: false,
    reason: "robots.txt disallow",
    source: "robots.txt",
    matchedRule: `Disallow: ${match.path}`,
  };
}

export function crawlDelayFor(
  policy: RobotsPolicy,
  productToken: string,
): number | null {
  if (policy.unavailableMode !== null) return null;
  const delays = matchingGroups(policy, productToken)
    .map((group) => group.crawlDelaySeconds)
    .filter((delay) => delay !== null);
  return delays.length === 0 ? null : Math.max(...delays);
}

export function unavailable(
  mode: "allow" | "disallow" | "seed-only",
): RobotsPolicy {
  return { groups: [], sitemaps: [], unavailableMode: mode };
}

function decisionFromFallback(
  mode: "allow" | "disallow" | "seed-only",
  isSeed: boolean,
): RobotsDecision {
  if (mode === "allow" || (mode === "seed-only" && isSeed)) {
    return allowedDecision("fallback", null);
  }
  return {
    allowed: false,
    reason: `robots fallback ${mode}`,
    source: "fallback",
    matchedRule: null,
  };
}

function allowedDecision(
  source: RobotsDecision["source"],
  matchedRule: string | null,
): RobotsDecision {
  return { allowed: true, reason: null, source, matchedRule };
}

function matchingRules(
  policy: RobotsPolicy,
  productToken: string,
): readonly RobotsRule[] {
  return matchingGroups(policy, productToken).flatMap((group) => group.rules);
}

function matchingGroups(
  policy: RobotsPolicy,
  productToken: string,
): readonly RobotsGroup[] {
  const token = productToken.toLowerCase();
  let bestLength = -1;
  const matched: RobotsGroup[] = [];
  for (const group of policy.groups) {
    const length = Math.max(
      ...group.agents.map((agent) => agentMatch(agent, token)),
    );
    if (length < 0 || length < bestLength) continue;
    if (length > bestLength) {
      matched.length = 0;
      bestLength = length;
    }
    matched.push(group);
  }
  return matched;
}

function agentMatch(agent: string, productToken: string): number {
  if (agent === "*") return 0;
  return productToken.includes(agent.toLowerCase()) ? agent.length : -1;
}

function bestRule(
  rules: readonly RobotsRule[],
  path: string,
): RobotsRule | null {
  let best: RobotsRule | null = null;
  let bestSpecificity = -1;
  for (const rule of rules) {
    if (rule.path === "" && rule.directive === "disallow") continue;
    const pattern = normalizeRobotsValue(rule.path, true);
    if (!robotsPathMatches(pattern, path)) continue;
    const specificity = patternSpecificity(pattern);
    if (
      specificity > bestSpecificity ||
      (specificity === bestSpecificity && rule.directive === "allow")
    ) {
      best = rule;
      bestSpecificity = specificity;
    }
  }
  return best;
}

function robotsPathMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const source = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = source
    .replace(/[|\\{}()[\]^$+?.]/gu, "\\$&")
    .replace(/\*/gu, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`, "u").test(path);
}

function patternSpecificity(pattern: string): number {
  const semantic = pattern.replace(/\*/gu, "").replace(/\$$/u, "");
  let octets = 0;
  for (let index = 0; index < semantic.length; index += 1) {
    if (
      semantic[index] === "%" &&
      /^[0-9A-F]{2}$/u.test(semantic.slice(index + 1, index + 3))
    ) {
      octets += 1;
      index += 2;
      continue;
    }
    const codePoint = semantic.codePointAt(index);
    if (codePoint === undefined) continue;
    const character = String.fromCodePoint(codePoint);
    octets += new TextEncoder().encode(character).byteLength;
    if (character.length === 2) index += 1;
  }
  return octets;
}

function normalizeRobotsValue(value: string, preserveSyntax: boolean): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = scalarAt(value, index);
    if (preserveSyntax && (character === "*" || character === "$")) {
      output += character;
      continue;
    }
    if (
      character === "%" &&
      /^[0-9A-Fa-f]{2}$/u.test(value.slice(index + 1, index + 3))
    ) {
      const byte = Number.parseInt(value.slice(index + 1, index + 3), 16);
      const decoded = String.fromCharCode(byte);
      output += isUnreserved(decoded)
        ? decoded
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      index += 2;
      continue;
    }
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint < 128) {
      output += character;
      continue;
    }
    output += encodeURIComponent(character).toUpperCase();
    if (character.length === 2) index += 1;
  }
  return output;
}

function scalarAt(value: string, index: number): string {
  const first = value.charCodeAt(index);
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = value.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return value.slice(index, index + 2);
    }
    return "\uFFFD";
  }
  if (first >= 0xdc00 && first <= 0xdfff) return "\uFFFD";
  return value[index] ?? "";
}

function isUnreserved(value: string): boolean {
  return /^[A-Za-z0-9._~-]$/u.test(value);
}
