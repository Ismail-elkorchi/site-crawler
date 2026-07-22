export function parseSrcset(value: string | null): readonly string[] {
  if (value === null) return [];
  const urls: string[] = [];
  let index = 0;
  while (index < value.length) {
    index = skipSeparators(value, index);
    if (index >= value.length) break;
    const parsed = readCandidate(value, index);
    index = parsed.next;
    if (parsed.url.length > 0) urls.push(parsed.url);
  }
  return urls;
}

function skipSeparators(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    const char = value[index];
    if (char !== "," && !isSpace(char)) break;
    index += 1;
  }
  return index;
}

function readCandidate(
  value: string,
  start: number,
): { readonly url: string; readonly next: number } {
  const dataUrl = value.slice(start, start + 5).toLowerCase() === "data:";
  let index = start;
  while (index < value.length) {
    const char = value[index];
    if (isSpace(char) || (!dataUrl && char === ",")) break;
    index += 1;
  }
  let url = value.slice(start, index);
  if (!dataUrl) url = url.replace(/,+$/u, "");
  index = skipDescriptor(value, index);
  return { url, next: index };
}

function skipDescriptor(value: string, start: number): number {
  let index = start;
  let parentheses = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === "(") parentheses += 1;
    if (char === ")" && parentheses > 0) parentheses -= 1;
    index += 1;
    if (char === "," && parentheses === 0) break;
  }
  return index;
}

function isSpace(char: string | undefined): boolean {
  return (
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === "\f"
  );
}
