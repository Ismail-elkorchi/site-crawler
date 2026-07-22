import type { EvidenceKind, EvidenceReference } from "./types.js";
import { assertCurrentSchema } from "../contracts/schema-identity.js";
import { validatePortableRelativePath } from "../core/portable-path.js";
import {
  integerField,
  nullableIntegerField,
  exactRecord,
  record,
  stringField,
} from "../validation/primitives.js";

export function parseEvidenceReference(value: unknown): EvidenceReference {
  const input = exactRecord(value, "evidence reference", [
    "schemaId",
    "schemaVersion",
    "algorithm",
    "digest",
    "kind",
    "mediaType",
    "byteLength",
    "capture",
    "relativePath",
    "createdAt",
  ]);
  assertCurrentSchema(
    input,
    "site-crawler.evidenceReference",
    "Evidence reference",
  );
  const algorithm = stringField(input, "algorithm");
  if (algorithm !== "sha256")
    throw new Error("Evidence algorithm is unsupported.");
  const kind = parseKind(stringField(input, "kind"));
  const digest = stringField(input, "digest");
  if (!/^[0-9a-f]{64}$/u.test(digest))
    throw new Error("Evidence digest must be a lowercase SHA-256 digest.");
  const byteLength = nonNegativeInteger(input, "byteLength");
  const capture = parseCapture(input["capture"], byteLength);
  const relativePath = validatePortableRelativePath(
    stringField(input, "relativePath"),
  );
  if (capture.kind === "complete" && capture.sourceByteLength !== byteLength) {
    throw new Error("Complete evidence byte lengths must agree.");
  }
  return {
    schemaId: "site-crawler.evidenceReference",
    schemaVersion: 1,
    algorithm,
    digest,
    kind,
    mediaType: stringField(input, "mediaType"),
    byteLength,
    capture,
    relativePath,
    createdAt: stringField(input, "createdAt"),
  };
}

function parseCapture(
  value: unknown,
  storedByteLength: number,
): EvidenceReference["capture"] {
  const candidate = record(value, "evidence capture");
  const kind = stringField(candidate, "kind");
  if (kind === "complete") {
    const input = exactRecord(value, "complete evidence capture", [
      "kind",
      "sourceByteLength",
    ]);
    return {
      kind,
      sourceByteLength: nonNegativeInteger(input, "sourceByteLength"),
    };
  }
  if (kind === "truncated") {
    const input = exactRecord(value, "truncated evidence capture", [
      "kind",
      "sourceByteLength",
      "limitBytes",
    ]);
    const sourceByteLength = nullableNonNegativeInteger(
      input,
      "sourceByteLength",
    );
    const limitBytes = nonNegativeInteger(input, "limitBytes");
    if (storedByteLength > limitBytes) {
      throw new Error("Truncated evidence exceeds its capture limit.");
    }
    if (sourceByteLength !== null && sourceByteLength <= storedByteLength) {
      throw new Error(
        "Truncated evidence source length must exceed its stored length.",
      );
    }
    return {
      kind,
      sourceByteLength,
      limitBytes,
    };
  }
  throw new Error("Evidence capture kind is unsupported.");
}

function nonNegativeInteger(
  input: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = integerField(input, key);
  if (value < 0) throw new Error(`${key} must be non-negative.`);
  return value;
}

function nullableNonNegativeInteger(
  input: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const value = nullableIntegerField(input, key);
  if (value !== null && value < 0)
    throw new Error(`${key} must be non-negative or null.`);
  return value;
}

function parseKind(value: string): EvidenceKind {
  if (value === "html" || value === "xml" || value === "rendered-html")
    return value;
  throw new Error("Evidence kind is unsupported.");
}
