import { JavascriptCandidateSet, literalMethod } from "./candidates.js";

const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\r\n])*)\1/gu;
const SOURCE_MAP = /[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/giu;

export function discoverJavascriptRegex(
  script: string,
  candidates: JavascriptCandidateSet,
): void {
  for (const match of script.matchAll(STRING_LITERAL)) {
    const value = match[2];
    if (value === undefined) continue;
    const method = literalMethod(unescapeLiteral(value));
    if (method !== null)
      candidates.add(unescapeLiteral(value), method, "medium", match.index);
  }
  for (const match of script.matchAll(SOURCE_MAP)) {
    const value = match[1];
    if (value !== undefined)
      candidates.add(value, "source-map", "high", match.index);
  }
}

export function discoverSourceMaps(
  script: string,
  candidates: JavascriptCandidateSet,
): void {
  for (const match of script.matchAll(SOURCE_MAP)) {
    const value = match[1];
    if (value !== undefined)
      candidates.add(value, "source-map", "high", match.index);
  }
}

function unescapeLiteral(value: string): string {
  return value.replace(/\\([\\"'`])/gu, "$1");
}
