import type { XmlElementNode } from "@ismail-elkorchi/xml-parser";
import { nowIso } from "../core/utils.js";
import { warning } from "../diagnostics/factory.js";
import type { CrawlWarning } from "../diagnostics/types.js";
import { normalizeUrl } from "../url/index.js";
import type { XmlResourceContext } from "./extraction-types.js";
import type {
  SitemapChangeFrequency,
  SitemapEntry,
  SitemapEntryKind,
} from "./types.js";
import { childText, elementChildren } from "./xml-dom.js";
import { SITEMAP_NAMESPACE } from "./xml-classifier.js";

export interface SitemapExtractionResult {
  readonly entries: readonly SitemapEntry[];
  readonly warnings: readonly CrawlWarning[];
}

export function extractSitemapEntries(
  input: XmlResourceContext,
  root: XmlElementNode,
): SitemapExtractionResult {
  const entryKind: SitemapEntryKind =
    root.localName === "sitemapindex" ? "sitemap" : "url";
  const candidates = elementChildren(root, entryKind, SITEMAP_NAMESPACE);
  const maxEntries = input.config.sitemaps.maxEntriesPerSitemap;
  const entries = candidates
    .slice(0, maxEntries)
    .map((child) => sitemapEntry(input, child, entryKind));
  const warnings: CrawlWarning[] = [];
  if (candidates.length > maxEntries) {
    warnings.push(
      warning(
        "SITEMAP_WARNING",
        "Sitemap entries were truncated by the configured per-file limit",
        `${candidates.length - maxEntries} entries were not extracted`,
      ),
    );
  }
  return { entries, warnings };
}

function sitemapEntry(
  input: XmlResourceContext,
  child: XmlElementNode,
  entryKind: SitemapEntryKind,
): SitemapEntry {
  const rawLoc = childText(child, "loc", SITEMAP_NAMESPACE);
  const warnings: CrawlWarning[] = [];
  const normalized =
    rawLoc === null ? null : normalizeUrl(rawLoc, input.finalUrl);
  if (rawLoc === null) {
    warnings.push(warning("SITEMAP_WARNING", "Sitemap entry is missing loc"));
  } else if (normalized?.ok === false) {
    warnings.push(
      warning(
        "SITEMAP_WARNING",
        "Sitemap entry URL is invalid",
        normalized.error,
      ),
    );
  }
  if (normalized?.ok === true) {
    warnings.push(
      ...locationWarnings(input.finalUrl, normalized.value.resolvedUrl),
    );
  }
  const lastmod = childText(child, "lastmod", SITEMAP_NAMESPACE);
  if (lastmod !== null && !validLastmod(lastmod)) {
    warnings.push(
      warning("SITEMAP_WARNING", "Sitemap lastmod is invalid", lastmod),
    );
  }
  const rawChangefreq = childText(child, "changefreq", SITEMAP_NAMESPACE);
  const changefreq = parseChangeFrequency(rawChangefreq, warnings);
  const rawPriority = childText(child, "priority", SITEMAP_NAMESPACE);
  const priority = parsePriority(rawPriority, warnings);
  return {
    schemaId: "site-crawler.sitemapEntry",
    schemaVersion: 1,
    runId: input.runId,
    sitemapUrl: input.finalUrl,
    entryKind,
    rawLoc,
    resolvedUrl: normalized?.ok === true ? normalized.value.resolvedUrl : null,
    normalizedUrl:
      normalized?.ok === true ? normalized.value.normalizedUrl : null,
    lastmod,
    changefreq,
    priority,
    warnings,
    discoveredAt: nowIso(),
  };
}

function parseChangeFrequency(
  raw: string | null,
  warnings: CrawlWarning[],
): SitemapChangeFrequency | null {
  if (raw === null) return null;
  if (isChangeFrequency(raw)) return raw;
  warnings.push(
    warning("SITEMAP_WARNING", "Sitemap changefreq is invalid", raw),
  );
  return null;
}

function isChangeFrequency(value: string): value is SitemapChangeFrequency {
  switch (value) {
    case "always":
    case "hourly":
    case "daily":
    case "weekly":
    case "monthly":
    case "yearly":
    case "never":
      return true;
    default:
      return false;
  }
}

function parsePriority(
  raw: string | null,
  warnings: CrawlWarning[],
): number | null {
  if (raw === null) return null;
  if (/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u.test(raw)) return Number(raw);
  warnings.push(warning("SITEMAP_WARNING", "Sitemap priority is invalid", raw));
  return null;
}

function validLastmod(value: string): boolean {
  const match =
    /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/u.exec(
      value,
    );
  if (match === null) return false;
  const year = Number(match[1]);
  const month = match[2] === undefined ? null : Number(match[2]);
  const day = match[3] === undefined ? null : Number(match[3]);
  if (month !== null && (month < 1 || month > 12)) return false;
  if (
    day !== null &&
    (month === null || day < 1 || day > daysInMonth(year, month))
  )
    return false;
  if (match[4] === undefined) return true;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return false;
  const zone = match[7];
  if (zone === undefined || zone === "Z") return zone === "Z";
  const offsetHour = Number(zone.slice(1, 3));
  const offsetMinute = Number(zone.slice(4, 6));
  return offsetHour <= 23 && offsetMinute <= 59;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2)
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function locationWarnings(
  sitemapUrl: string,
  entryUrl: string,
): readonly CrawlWarning[] {
  const sitemap = new URL(sitemapUrl);
  const entry = new URL(entryUrl);
  const warnings: CrawlWarning[] = [];
  if (
    sitemap.protocol !== entry.protocol ||
    sitemap.hostname !== entry.hostname ||
    effectivePort(sitemap) !== effectivePort(entry)
  ) {
    warnings.push(
      warning(
        "SITEMAP_WARNING",
        "Sitemap entry does not use the sitemap origin",
        entry.href,
      ),
    );
    return warnings;
  }
  const prefix = sitemap.pathname.slice(
    0,
    sitemap.pathname.lastIndexOf("/") + 1,
  );
  if (!entry.pathname.startsWith(prefix)) {
    warnings.push(
      warning(
        "SITEMAP_WARNING",
        "Sitemap entry is outside the sitemap path prefix",
        entry.pathname,
      ),
    );
  }
  return warnings;
}

function effectivePort(url: URL): string {
  if (url.port !== "") return url.port;
  return url.protocol === "https:" ? "443" : "80";
}
