export type SkipReason =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "SCOPE_REJECTED"
  | "ROBOTS_DISALLOWED"
  | "NETWORK_SAFETY_REJECTED"
  | "MAX_DEPTH_EXCEEDED"
  | "MAX_REQUESTS_EXCEEDED"
  | "MAX_QUEUE_SIZE_EXCEEDED"
  | "MAX_URL_LENGTH_EXCEEDED"
  | "MAX_PATH_SEGMENTS_EXCEEDED"
  | "MAX_QUERY_PARAMS_EXCEEDED"
  | "PATH_PATTERN_LIMIT_EXCEEDED"
  | "DIRECTORY_LIMIT_EXCEEDED"
  | "DUPLICATE"
  | "CONTENT_TYPE_EXCLUDED"
  | "USER_EXCLUDE_PATTERN"
  | "ASSET_SKIPPED"
  | "RENDER_LIMIT_EXCEEDED"
  | "SITEMAP_LIMIT_EXCEEDED"
  | "DUPLICATE_BODY_PATTERN_LIMIT_EXCEEDED";
export type CrawlErrorCode =
  | "CONFIG_ERROR"
  | "URL_PARSE_ERROR"
  | "UNSUPPORTED_PROTOCOL"
  | "SCOPE_REJECTED"
  | "ROBOTS_DISALLOWED"
  | "ROBOTS_FETCH_FAILED"
  | "ROBOTS_PARSE_ERROR"
  | "NETWORK_SAFETY_REJECTED"
  | "DNS_ERROR"
  | "TLS_ERROR"
  | "FETCH_TIMEOUT"
  | "FETCH_CONNECT_TIMEOUT"
  | "FETCH_FIRST_BYTE_TIMEOUT"
  | "FETCH_ABORTED"
  | "FETCH_NETWORK_ERROR"
  | "FETCH_DECOMPRESSION_ERROR"
  | "UNSUPPORTED_CONTENT_ENCODING"
  | "HTTP_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "REDIRECT_LOOP"
  | "REDIRECT_TARGET_REJECTED"
  | "RESPONSE_TOO_LARGE"
  | "DECOMPRESSED_RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "DECODE_ERROR"
  | "HTML_PARSE_ERROR"
  | "HTML_BUDGET_EXCEEDED"
  | "XML_PARSE_ERROR"
  | "XML_BUDGET_EXCEEDED"
  | "SITEMAP_FETCH_FAILED"
  | "SITEMAP_PARSE_ERROR"
  | "FEED_PARSE_ERROR"
  | "RENDER_TIMEOUT"
  | "RENDER_ERROR"
  | "STORAGE_WRITE_ERROR"
  | "FRONTIER_JOURNAL_ERROR"
  | "SNAPSHOT_WRITE_ERROR"
  | "EXTENSION_ERROR"
  | "RESUME_ERROR"
  | "INTERNAL_ERROR";
export type WarningCode =
  | "CONTENT_TYPE_MISMATCH"
  | "DECODE_WARNING"
  | "ROBOTS_WARNING"
  | "SITEMAP_WARNING"
  | "FEED_WARNING"
  | "HTML_PARSE_WARNING"
  | "XML_PARSE_WARNING"
  | "LINK_LIMIT_REACHED"
  | "BASE_HREF_IGNORED"
  | "RAW_SNAPSHOT_ENABLED"
  | "MIDDLEWARE_WARNING"
  | "RENDER_WARNING"
  | "RESUME_WARNING";
export interface CrawlWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly detail: string | null;
  readonly createdAt: string;
}
export interface CrawlError {
  readonly schemaId: "site-crawler.error";
  readonly schemaVersion: 1;
  readonly code: CrawlErrorCode;
  readonly message: string;
  readonly url: string | null;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly fatal: boolean;
  readonly attempt: number | null;
  readonly causeName: string | null;
  readonly causeMessage: string | null;
  readonly createdAt: string;
}
