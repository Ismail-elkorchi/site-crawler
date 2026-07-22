import type { ExtractedLink, LinkKind } from "../links/types.js";

export function parseHttpLinkHeader(
  value: string | null,
): readonly ExtractedLink[] {
  if (value === null || value.trim().length === 0) return [];
  const links: ExtractedLink[] = [];
  let index = 0;
  for (const segment of splitHeader(value)) {
    const parsed = parseSegment(segment);
    if (parsed === null) continue;
    links.push({
      raw: parsed.target,
      source: "http-link-header",
      kind: kindForRel(parsed.rel),
      anchorText: null,
      rel: parsed.rel,
      target: null,
      evidence: {
        kind: "http-header",
        method: "link-header",
        index,
      },
    });
    index += 1;
  }
  return links;
}

function splitHeader(value: string): readonly string[] {
  const segments: string[] = [];
  let start = 0;
  let quoted = false;
  let angle = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "<") angle = true;
    if (!quoted && char === ">") angle = false;
    if (!quoted && !angle && char === ",") {
      segments.push(value.slice(start, index));
      start = index + 1;
    }
  }
  segments.push(value.slice(start));
  return segments;
}

function parseSegment(
  segment: string,
): { readonly target: string; readonly rel: readonly string[] } | null {
  const start = segment.indexOf("<");
  const end = segment.indexOf(">", start + 1);
  if (start < 0 || end <= start + 1) return null;
  const target = segment.slice(start + 1, end).trim();
  if (target.length === 0) return null;
  const parameters = segment.slice(end + 1);
  const rel = parameterValue(parameters, "rel")
    .split(/\s+/u)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return { target, rel };
}

function parameterValue(parameters: string, name: string): string {
  const expression = new RegExp(
    `(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`,
    "iu",
  );
  const match = expression.exec(parameters);
  return match?.[1] ?? match?.[2] ?? "";
}

function kindForRel(rel: readonly string[]): LinkKind {
  if (rel.includes("canonical")) return "canonical";
  if (rel.includes("alternate")) return "alternate";
  if (rel.includes("stylesheet")) return "stylesheet";
  if (rel.includes("manifest")) return "manifest";
  if (rel.includes("preload") || rel.includes("modulepreload"))
    return "preload";
  if (rel.includes("prefetch") || rel.includes("prerender")) return "prefetch";
  if (rel.includes("next") || rel.includes("prev")) return "navigation";
  return "asset";
}
