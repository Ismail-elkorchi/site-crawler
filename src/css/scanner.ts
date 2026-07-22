import type { CssDiscoveredUrl } from "./types.js";

const METHOD_PRIORITY: Readonly<Record<CssDiscoveredUrl["method"], number>> = {
  "source-map": 3,
  import: 2,
  url: 1,
};

interface CssToken {
  readonly value: string;
  readonly next: number;
}

export function scanCssUrls(
  stylesheet: string,
  maximum: number,
): readonly CssDiscoveredUrl[] {
  const found = new CssCandidateSet(maximum);
  let index = 0;
  while (index < stylesheet.length) {
    if (stylesheet.startsWith("/*", index)) {
      index = scanComment(stylesheet, index, found);
      continue;
    }
    const character = stylesheet[index];
    if (character === '"' || character === "'") {
      index = scanQuoted(stylesheet, index).next;
      continue;
    }
    if (character === "@") {
      const name = scanIdentifier(stylesheet, index + 1);
      if (name !== null && name.value.toLowerCase() === "import") {
        index = scanImport(stylesheet, name.next, found);
        continue;
      }
      index = name?.next ?? index + 1;
      continue;
    }
    const identifier = scanIdentifier(stylesheet, index);
    if (identifier !== null) {
      if (identifier.value.toLowerCase() === "url") {
        const parsed = scanUrlFunction(stylesheet, identifier.next);
        if (parsed !== null) {
          found.add(parsed.value, "url", "high", index);
          index = parsed.next;
          continue;
        }
      }
      index = identifier.next;
      continue;
    }
    index += 1;
  }
  return found.values();
}

class CssCandidateSet {
  private readonly found = new Map<string, CssDiscoveredUrl>();
  private readonly maximum: number;

  public constructor(maximum: number) {
    this.maximum = maximum;
  }

  public add(
    rawUrl: string,
    method: CssDiscoveredUrl["method"],
    confidence: CssDiscoveredUrl["confidence"],
    offset: number,
  ): void {
    const normalized = cleanUrl(rawUrl);
    if (normalized === null || this.maximum <= 0) return;
    const candidate = { rawUrl: normalized, method, confidence, offset };
    const current = this.found.get(normalized);
    if (current !== undefined) {
      if (compare(candidate, current) > 0)
        this.found.set(normalized, candidate);
      return;
    }
    if (this.found.size < this.maximum) {
      this.found.set(normalized, candidate);
      return;
    }
    const worst = [...this.found.values()].sort(compare)[0];
    if (worst !== undefined && compare(candidate, worst) > 0) {
      this.found.delete(worst.rawUrl);
      this.found.set(normalized, candidate);
    }
  }

  public values(): readonly CssDiscoveredUrl[] {
    return [...this.found.values()].sort((left, right) => compare(right, left));
  }
}

function scanComment(
  stylesheet: string,
  start: number,
  found: CssCandidateSet,
): number {
  const end = stylesheet.indexOf("*/", start + 2);
  const next = end < 0 ? stylesheet.length : end + 2;
  const comment = stylesheet.slice(start + 2, end < 0 ? undefined : end);
  const match = /[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/iu.exec(comment);
  const raw = match?.[1];
  if (raw !== undefined)
    found.add(raw, "source-map", "high", start + (match?.index ?? 0));
  return next;
}

function scanImport(
  stylesheet: string,
  start: number,
  found: CssCandidateSet,
): number {
  const position = skipIgnorable(stylesheet, start);
  const quote = stylesheet[position];
  if (quote === '"' || quote === "'") {
    const parsed = scanQuoted(stylesheet, position);
    if (parsed.closed) found.add(parsed.value, "import", "high", position);
    return parsed.next;
  }
  const identifier = scanIdentifier(stylesheet, position);
  if (identifier?.value.toLowerCase() !== "url") return position + 1;
  const parsed = scanUrlFunction(stylesheet, identifier.next);
  if (parsed === null) return identifier.next;
  found.add(parsed.value, "import", "high", position);
  return parsed.next;
}

function scanUrlFunction(stylesheet: string, start: number): CssToken | null {
  let index = skipWhitespace(stylesheet, start);
  if (stylesheet[index] !== "(") return null;
  index = skipWhitespace(stylesheet, index + 1);
  const quote = stylesheet[index];
  if (quote === '"' || quote === "'") {
    const parsed = scanQuoted(stylesheet, index);
    if (!parsed.closed) return null;
    const closing = skipWhitespace(stylesheet, parsed.next);
    if (stylesheet[closing] !== ")") return null;
    return { value: parsed.value, next: closing + 1 };
  }
  let value = "";
  while (index < stylesheet.length) {
    const character = stylesheet[index];
    if (character === ")") return { value: value.trim(), next: index + 1 };
    if (/\s/u.test(character ?? "")) {
      const closing = skipWhitespace(stylesheet, index);
      return stylesheet[closing] === ")"
        ? { value: value.trim(), next: closing + 1 }
        : null;
    }
    if (character === '"' || character === "'" || character === "(")
      return null;
    if (character === "\\") {
      const escaped = consumeEscape(stylesheet, index);
      if (escaped === null) return null;
      value += escaped.value;
      index = escaped.next;
      continue;
    }
    if (character === "\n" || character === "\r" || character === "\f")
      return null;
    value += character ?? "";
    index += 1;
  }
  return null;
}

function scanQuoted(
  stylesheet: string,
  start: number,
): CssToken & { readonly closed: boolean } {
  const quote = stylesheet[start];
  let index = start + 1;
  let value = "";
  while (index < stylesheet.length) {
    const character = stylesheet[index];
    if (character === quote) return { value, next: index + 1, closed: true };
    if (character === "\n" || character === "\r" || character === "\f")
      return { value, next: index + 1, closed: false };
    if (character === "\\") {
      const escaped = consumeEscape(stylesheet, index);
      if (escaped === null) return { value, next: index + 1, closed: false };
      value += escaped.value;
      index = escaped.next;
      continue;
    }
    value += character ?? "";
    index += 1;
  }
  return { value, next: index, closed: false };
}

function scanIdentifier(stylesheet: string, start: number): CssToken | null {
  let index = start;
  let value = "";
  while (index < stylesheet.length) {
    const character = stylesheet[index];
    if (isIdentifierCharacter(character)) {
      value += character;
      index += 1;
      continue;
    }
    if (character === "\\") {
      const escaped = consumeEscape(stylesheet, index);
      if (escaped === null) break;
      value += escaped.value;
      index = escaped.next;
      continue;
    }
    break;
  }
  return index === start ? null : { value, next: index };
}

function consumeEscape(stylesheet: string, start: number): CssToken | null {
  const first = stylesheet[start + 1];
  if (first === undefined || first === "\n" || first === "\r" || first === "\f")
    return null;
  if (!/[0-9A-Fa-f]/u.test(first)) return { value: first, next: start + 2 };
  let end = start + 1;
  while (end < stylesheet.length && end < start + 7) {
    if (!/[0-9A-Fa-f]/u.test(stylesheet[end] ?? "")) break;
    end += 1;
  }
  const codePoint = Number.parseInt(stylesheet.slice(start + 1, end), 16);
  if (/\s/u.test(stylesheet[end] ?? "")) end += 1;
  return {
    value:
      codePoint === 0 || codePoint > 0x10ffff || isSurrogate(codePoint)
        ? "\uFFFD"
        : String.fromCodePoint(codePoint),
    next: end,
  };
}

function skipIgnorable(stylesheet: string, start: number): number {
  let index = start;
  while (true) {
    index = skipWhitespace(stylesheet, index);
    if (!stylesheet.startsWith("/*", index)) return index;
    const end = stylesheet.indexOf("*/", index + 2);
    if (end < 0) return stylesheet.length;
    index = end + 2;
  }
}

function skipWhitespace(stylesheet: string, start: number): number {
  let index = start;
  while (/\s/u.test(stylesheet[index] ?? "")) index += 1;
  return index;
}

function isIdentifierCharacter(value: string | undefined): boolean {
  return value !== undefined && /[-_A-Za-z0-9\u0080-\u{10FFFF}]/u.test(value);
}

function isSurrogate(codePoint: number): boolean {
  return codePoint >= 0xd800 && codePoint <= 0xdfff;
}

function cleanUrl(value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 8192 ||
    /^(?:data|javascript|blob):/iu.test(trimmed)
  )
    return null;
  return trimmed;
}

function compare(left: CssDiscoveredUrl, right: CssDiscoveredUrl): number {
  const priority = METHOD_PRIORITY[left.method] - METHOD_PRIORITY[right.method];
  if (priority !== 0) return priority;
  if (left.offset !== right.offset) return right.offset - left.offset;
  return right.rawUrl.localeCompare(left.rawUrl);
}
