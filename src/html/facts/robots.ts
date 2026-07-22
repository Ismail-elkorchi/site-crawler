import type { RobotsHeaderFact } from "../types.js";

export function parseXRobotsTag(
  value: string | null,
): readonly RobotsHeaderFact[] {
  if (value === null) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(parsePart);
}

function parsePart(raw: string): RobotsHeaderFact {
  const colon = raw.indexOf(":");
  if (colon <= 0) {
    return { raw, agent: null, directives: directiveValues(raw) };
  }
  const possibleAgent = raw.slice(0, colon).trim().toLowerCase();
  const remainder = raw.slice(colon + 1).trim();
  if (possibleAgent.includes(" ") || remainder.length === 0) {
    return { raw, agent: null, directives: directiveValues(raw) };
  }
  return {
    raw,
    agent: possibleAgent,
    directives: directiveValues(remainder),
  };
}

function directiveValues(value: string): readonly string[] {
  return value
    .split(/\s+/u)
    .map((directive) => directive.trim().toLowerCase())
    .filter((directive) => directive.length > 0);
}
