import type {
  DiscoveryConfidence,
  JavascriptDiscoveryMethod,
} from "../discovery/types.js";
import type { JavascriptDiscoveredUrl } from "./types.js";

const METHOD_PRIORITY: Readonly<Record<JavascriptDiscoveryMethod, number>> = {
  "fetch-call": 8,
  "xhr-open": 8,
  "dynamic-import": 8,
  "url-constructor": 8,
  "source-map": 7,
  "absolute-literal": 5,
  "relative-literal": 4,
};
const CONFIDENCE_PRIORITY: Readonly<Record<DiscoveryConfidence, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

export class JavascriptCandidateSet {
  private readonly candidates = new Map<string, JavascriptDiscoveredUrl>();
  private readonly maximum: number;

  public constructor(maximum: number) {
    this.maximum = maximum;
  }

  public add(
    rawUrl: string,
    method: JavascriptDiscoveryMethod,
    confidence: DiscoveryConfidence,
    offset: number | null,
  ): void {
    const normalized = cleanCandidate(rawUrl);
    if (normalized === null) return;
    const next: JavascriptDiscoveredUrl = {
      rawUrl: normalized,
      method,
      confidence,
      offset,
    };
    const current = this.candidates.get(normalized);
    if (current !== undefined) {
      if (compareCandidates(next, current) > 0)
        this.candidates.set(normalized, next);
      return;
    }
    if (this.maximum <= 0) return;
    if (this.candidates.size < this.maximum) {
      this.candidates.set(normalized, next);
      return;
    }
    const worst = [...this.candidates.values()].sort(compareCandidates)[0];
    if (worst !== undefined && compareCandidates(next, worst) > 0) {
      this.candidates.delete(worst.rawUrl);
      this.candidates.set(normalized, next);
    }
  }

  public values(): readonly JavascriptDiscoveredUrl[] {
    return [...this.candidates.values()].sort((left, right) =>
      compareCandidates(right, left),
    );
  }
}

function compareCandidates(
  left: JavascriptDiscoveredUrl,
  right: JavascriptDiscoveredUrl,
): number {
  const method = METHOD_PRIORITY[left.method] - METHOD_PRIORITY[right.method];
  if (method !== 0) return method;
  const confidence =
    CONFIDENCE_PRIORITY[left.confidence] -
    CONFIDENCE_PRIORITY[right.confidence];
  if (confidence !== 0) return confidence;
  const leftOffset = left.offset ?? Number.MAX_SAFE_INTEGER;
  const rightOffset = right.offset ?? Number.MAX_SAFE_INTEGER;
  if (leftOffset !== rightOffset) return rightOffset - leftOffset;
  return right.rawUrl.localeCompare(left.rawUrl);
}

export function literalMethod(
  value: string,
): "absolute-literal" | "relative-literal" | null {
  if (/^https?:\/\//iu.test(value) || value.startsWith("//"))
    return "absolute-literal";
  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../")
  )
    return "relative-literal";
  return null;
}

function cleanCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 8192) return null;
  if (/^(?:javascript|data|blob|mailto|tel):/iu.test(trimmed)) return null;
  return trimmed;
}
