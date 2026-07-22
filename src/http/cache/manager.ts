import fs from "node:fs/promises";
import {
  ensurePrivateDirectory,
  protectPrivateFile,
} from "../../core/private-files.js";
import { validatePersistedRecord } from "../../contracts/catalog.js";
import path from "node:path";
import { sha256 } from "../../core/utils.js";
import { readResponseBody, responseBodySize } from "../body.js";
import type { FetchResult } from "../types.js";
import { parseCacheMetadata } from "./metadata.js";
import { writeCacheFile } from "./storage.js";
import type { CachedResponseMetadata, HttpCacheConfig } from "./types.js";

export interface CachePreparation {
  readonly headers: Readonly<Record<string, string>>;
  readonly cached: CachedResponseMetadata | null;
}

export class HttpCache {
  private readonly config: HttpCacheConfig;

  public constructor(config: HttpCacheConfig) {
    this.config = config;
  }

  public async prepare(
    url: string,
    input: Readonly<Record<string, string>>,
  ): Promise<CachePreparation> {
    if (!this.config.enabled) return { headers: { ...input }, cached: null };
    await ensurePrivateDirectory(this.config.directory);
    const cached = await this.load(url);
    if (cached === null) return { headers: { ...input }, cached: null };
    const headers: Record<string, string> = { ...input };
    if (cached.etag !== null && !hasHeader(headers, "if-none-match"))
      headers["if-none-match"] = cached.etag;
    if (
      cached.lastModified !== null &&
      !hasHeader(headers, "if-modified-since")
    )
      headers["if-modified-since"] = cached.lastModified;
    return { headers, cached };
  }

  public async apply(
    url: string,
    result: FetchResult,
    cached: CachedResponseMetadata | null,
  ): Promise<FetchResult> {
    if (!this.config.enabled) return { ...result, cacheStatus: "disabled" };
    if (result.statusCode === 304 && cached !== null) {
      return await this.revalidated(result, cached);
    }
    if (
      result.error !== null &&
      this.config.useStaleOnError &&
      cached !== null
    ) {
      const stale = await this.cachedBody(cached);
      if (stale !== null) {
        return {
          ...result,
          statusCode: cached.statusCode,
          finalUrl: url,
          headers: mergedHeaders(result.headers, cached),
          body: stale,
          cacheStatus: "stale-on-error",
          error: null,
        };
      }
    }
    if (eligibleForStorage(result)) await this.store(url, result);
    return {
      ...result,
      cacheStatus: eligibleForStorage(result) ? "stored" : "miss",
    };
  }

  private async revalidated(
    result: FetchResult,
    cached: CachedResponseMetadata,
  ): Promise<FetchResult> {
    const body = await this.cachedBody(cached);
    return {
      ...result,
      headers: mergedHeaders(result.headers, cached),
      body,
      cacheStatus: body === null ? "not-modified-without-body" : "revalidated",
    };
  }

  private async store(url: string, result: FetchResult): Promise<void> {
    await ensurePrivateDirectory(this.config.directory);
    const key = sha256(url);
    const bodySize = responseBodySize(result.body);
    const canStoreBody =
      this.config.storeBodies &&
      result.body !== null &&
      bodySize <= this.config.maxBodyBytes;
    const canonicalBodyPath = path.join(this.config.directory, `${key}.body`);
    const bodyPath = canStoreBody ? canonicalBodyPath : null;
    if (bodyPath !== null && result.body !== null) {
      await writeCacheFile(bodyPath, await readResponseBody(result.body));
    } else {
      await fs.rm(canonicalBodyPath, { force: true });
    }
    const metadata: CachedResponseMetadata = {
      schemaId: "site-crawler.httpCache",
      schemaVersion: 1,
      url,
      etag: result.headers.get("etag"),
      lastModified: result.headers.get("last-modified"),
      contentType: result.headers.get("content-type"),
      statusCode: result.statusCode ?? 200,
      bodyPresent: bodyPath !== null,
      bodyBytes: bodyPath === null ? 0 : bodySize,
      storedAt: new Date().toISOString(),
    };
    validatePersistedRecord(metadata);
    await writeCacheFile(
      path.join(this.config.directory, `${key}.json`),
      new TextEncoder().encode(`${JSON.stringify(metadata, null, 2)}\n`),
    );
  }

  private async load(url: string): Promise<CachedResponseMetadata | null> {
    const filePath = path.join(this.config.directory, `${sha256(url)}.json`);
    try {
      await protectPrivateFile(filePath);
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
      validatePersistedRecord(parsed);
      return parseCacheMetadata(parsed, url);
    } catch (caught) {
      if (isMissingFile(caught)) return null;
      throw caught;
    }
  }

  private async cachedBody(
    cached: CachedResponseMetadata,
  ): Promise<FetchResult["body"]> {
    if (!cached.bodyPresent) return null;
    const bodyPath = path.join(
      this.config.directory,
      `${sha256(cached.url)}.body`,
    );
    try {
      await protectPrivateFile(bodyPath);
      const stat = await fs.stat(bodyPath);
      if (stat.size !== cached.bodyBytes) {
        throw new Error("Cached body size does not match its metadata.");
      }
      return {
        kind: "file",
        path: bodyPath,
        size: stat.size,
        temporary: false,
      };
    } catch (caught) {
      if (isMissingFile(caught)) return null;
      throw caught;
    }
  }
}

function eligibleForStorage(result: FetchResult): boolean {
  const status = result.statusCode;
  return (
    result.error === null &&
    result.body !== null &&
    status !== null &&
    status >= 200 &&
    status < 300 &&
    (result.headers.has("etag") || result.headers.has("last-modified"))
  );
}

function mergedHeaders(
  response: Headers,
  cached: CachedResponseMetadata,
): Headers {
  const headers = new Headers(response);
  if (!headers.has("content-type") && cached.contentType !== null)
    headers.set("content-type", cached.contentType);
  if (!headers.has("etag") && cached.etag !== null)
    headers.set("etag", cached.etag);
  if (!headers.has("last-modified") && cached.lastModified !== null)
    headers.set("last-modified", cached.lastModified);
  return headers;
}

function hasHeader(
  headers: Readonly<Record<string, string>>,
  name: string,
): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

function isMissingFile(value: unknown): boolean {
  return value instanceof Error && "code" in value && value.code === "ENOENT";
}
