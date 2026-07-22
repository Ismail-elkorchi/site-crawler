import type { EncodingFact } from "./types.js";

export type EncodingKind = "html" | "xml" | "text";
export type EncodingDetection = Omit<EncodingFact, "hadReplacementChars">;

export function detectEncoding(
  bodyPrefix: Uint8Array,
  contentType: string | null,
  kind: EncodingKind,
): EncodingDetection {
  const bom = sniffBom(bodyPrefix);
  if (bom !== null) return { encoding: bom, source: "bom" };
  const header = parseCharset(contentType);
  if (header !== null) return { encoding: header, source: "http-header" };
  if (kind === "html") {
    const meta = sniffHtmlMeta(bodyPrefix);
    if (meta !== null) return { encoding: meta, source: "html-meta" };
  }
  if (kind === "xml") {
    const signature = sniffXmlSignature(bodyPrefix);
    if (signature !== null)
      return { encoding: signature, source: "xml-signature" };
    const declaration = sniffXmlDeclaration(bodyPrefix);
    if (declaration !== null)
      return { encoding: declaration, source: "xml-declaration" };
  }
  return { encoding: "utf-8", source: "fallback" };
}

function parseCharset(contentType: string | null): string | null {
  if (contentType === null) return null;
  const match =
    /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/iu.exec(
      contentType,
    );
  return normalizeEncoding(match?.[1] ?? match?.[2] ?? match?.[3] ?? null);
}

function sniffHtmlMeta(body: Uint8Array): string | null {
  const prefix = asciiPrefix(body, 1024);
  const direct =
    /<meta\s+[^>]*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s/>]+))/iu.exec(
      prefix,
    );
  const directValue = normalizeEncoding(
    direct?.[1] ?? direct?.[2] ?? direct?.[3] ?? null,
  );
  if (directValue !== null) return directValue;
  const equiv =
    /<meta\s+[^>]*http-equiv\s*=\s*(?:"content-type"|'content-type'|content-type)[^>]*content\s*=\s*(?:"([^"]+)"|'([^']+)'|([^>]+))/iu.exec(
      prefix,
    );
  return parseCharset(equiv?.[1] ?? equiv?.[2] ?? equiv?.[3] ?? null);
}

function sniffXmlDeclaration(body: Uint8Array): string | null {
  const prefix = asciiPrefix(body, 512);
  const match =
    /^\s*<\?xml\s+[^?]*encoding\s*=\s*(?:"([^"]+)"|'([^']+)')/iu.exec(prefix);
  return normalizeEncoding(match?.[1] ?? match?.[2] ?? null);
}

function asciiPrefix(body: Uint8Array, maxBytes: number): string {
  return new TextDecoder("windows-1252", { fatal: false }).decode(
    body.slice(0, maxBytes),
  );
}

function normalizeEncoding(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
}

function sniffBom(body: Uint8Array): string | null {
  if (
    body[0] === 0x00 &&
    body[1] === 0x00 &&
    body[2] === 0xfe &&
    body[3] === 0xff
  )
    return "utf-32be";
  if (
    body[0] === 0xff &&
    body[1] === 0xfe &&
    body[2] === 0x00 &&
    body[3] === 0x00
  )
    return "utf-32le";
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) return "utf-8";
  if (body[0] === 0xfe && body[1] === 0xff) return "utf-16be";
  if (body[0] === 0xff && body[1] === 0xfe) return "utf-16le";
  return null;
}

function sniffXmlSignature(body: Uint8Array): string | null {
  const signature = firstFourBytes(body);
  if (signature === null) return null;
  if (signature === "00 00 00 3c") return "utf-32be";
  if (signature === "3c 00 00 00") return "utf-32le";
  if (signature === "00 00 3c 00") return "x-iso-10646-ucs-4-2143";
  if (signature === "00 3c 00 00") return "x-iso-10646-ucs-4-3412";
  if (signature === "00 3c 00 3f") return "utf-16be";
  if (signature === "3c 00 3f 00") return "utf-16le";
  if (signature === "4c 6f a7 94") return "ibm037";
  return null;
}

function firstFourBytes(body: Uint8Array): string | null {
  if (body.byteLength < 4) return null;
  return Array.from(body.slice(0, 4), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join(" ");
}
