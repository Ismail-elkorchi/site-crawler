# Robots and sitemaps

## Robots product token

The HTTP `User-Agent` header and the robots product token are separate configuration values. Group selection uses the product token.

The matcher combines groups with the longest matching product token, supports `*` and `$`, normalizes equivalent percent-encoded octets by Unicode scalar value, replaces malformed lone surrogates deterministically, preserves encoded reserved separators, chooses the longest matching rule, and lets `Allow` win an equal-specificity tie.

An empty `Disallow` rule does not block crawling.

## Fetch limits and cache

Robots downloads use a dedicated byte limit and no more than the configured redirect limit capped at five hops. Policies are cached for a bounded duration. If a refresh fails and a cached policy exists, the cached policy can remain effective while the fetch record identifies stale-cache use.

Fallback modes are:

- `allow`;
- `disallow`;
- `seed-only`.

`seed-only` permits the configured seed request and rejects discovered requests for that origin.

Robots decisions are crawl policy, not access control.

## Sitemap discovery

Sitemaps may come from:

- `Sitemap:` directives in robots;
- `/sitemap.xml` probing;
- manual configuration;
- sitemap-index entries.

Every sitemap request still passes URL, scope, network-safety, robots, and request-budget checks.

## Sitemap limits

The crawler enforces:

- maximum sitemap files per run;
- maximum entries per sitemap;
- maximum entries across the run;
- maximum sitemap-index depth;
- recursive index detection;
- XML byte, node, and depth budgets;
- bounded `.xml.gz` decompression.

When an entry limit is reached, retained evidence is deterministic and the XML resource includes a truncation warning.

## XML processing boundary

Transport collection enforces compressed and decoded byte limits and can spool large responses to a private temporary file. XML processing then reads the exact collected bytes once, records those same bytes when evidence is enabled, applies BOM/transport/XML encoding precedence, and passes the decoded text to `xml-parser` under its own input, node, depth, and text budgets. UTF-32 signatures are recognized and reported as unsupported rather than being misread as UTF-16. File-compressed `.xml.gz` payloads use a separate decompressed-byte budget.

The crawler materializes the `xml-parser` document tree before sitemap or feed entries are dispatched. Transport spooling bounds network collection memory; XML tree construction is not SAX-style incremental entry emission.

## Entry validation

Element and attribute matching is case-sensitive and namespace-aware. Sitemap vocabulary uses the sitemap namespace, Atom uses the Atom namespace, and RSS uses unqualified RSS names. Each sitemap entry preserves its raw location and optional fields. Diagnostics cover:

- missing `loc`;
- invalid URL;
- invalid `lastmod`;
- unsupported `changefreq`;
- priority outside 0 through 1;
- origin mismatch;
- path-prefix mismatch;
- recursive sitemap references.

Diagnostics are factual. The crawler does not assign SEO severity.
