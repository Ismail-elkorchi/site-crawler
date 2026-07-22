export interface HttpCacheConfig {
  readonly enabled: boolean;
  readonly directory: string;
  readonly storeBodies: boolean;
  readonly maxBodyBytes: number;
  readonly useStaleOnError: boolean;
}

export interface CachedResponseMetadata {
  readonly schemaId: "site-crawler.httpCache";
  readonly schemaVersion: 1;
  readonly url: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly contentType: string | null;
  readonly statusCode: number;
  readonly bodyPresent: boolean;
  readonly bodyBytes: number;
  readonly storedAt: string;
}

export type CacheStatus =
  | "miss"
  | "stored"
  | "revalidated"
  | "not-modified-without-body"
  | "stale-on-error"
  | "disabled";
