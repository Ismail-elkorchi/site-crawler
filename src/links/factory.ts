import { makeId, nowIso } from "../core/utils.js";
import type { LinkDiscoveryEvidence } from "../discovery/types.js";
import { normalizeUrl } from "../url/index.js";
import type {
  EnqueueDecision,
  LinkEdge,
  LinkKind,
  LinkSource,
} from "./types.js";

export interface LinkEdgeInput {
  readonly runId: string;
  readonly fromUrl: string;
  readonly raw: string;
  readonly source: LinkSource;
  readonly kind: LinkKind;
  readonly anchorText: string | null;
  readonly rel: readonly string[];
  readonly target: string | null;
  readonly depth: number;
  readonly evidence: LinkDiscoveryEvidence;
  readonly enqueueDecision: EnqueueDecision;
}

export function createLinkEdge(input: LinkEdgeInput): LinkEdge {
  const normalized = normalizeUrl(input.raw, input.fromUrl);
  const relSet = new Set(input.rel.map((value) => value.toLowerCase()));
  return {
    schemaId: "site-crawler.linkEdge",
    schemaVersion: 1,
    id: makeId(
      "link",
      `${input.fromUrl}->${input.raw}:${input.source}:${input.kind}`,
    ),
    runId: input.runId,
    fromUrl: input.fromUrl,
    toRaw: input.raw,
    toResolved: normalized.ok ? normalized.value.resolvedUrl : null,
    toNormalized: normalized.ok ? normalized.value.normalizedUrl : null,
    toFinalUrl: null,
    source: input.source,
    linkKind: input.kind,
    anchorText: input.anchorText,
    rel: input.rel,
    target: input.target,
    nofollow: relSet.has("nofollow"),
    sponsored: relSet.has("sponsored"),
    ugc: relSet.has("ugc"),
    depth: input.depth,
    discoveredAt: nowIso(),
    evidence: input.evidence,
    enqueueDecision: input.enqueueDecision,
  };
}
