import { errorMessage, errorName, nowIso } from "../core/utils.js";
import type {
  CrawlError,
  CrawlErrorCode,
  CrawlWarning,
  WarningCode,
} from "./types.js";

export interface CrawlErrorInput {
  readonly code: CrawlErrorCode;
  readonly message: string;
  readonly url?: string | null;
  readonly requestId?: string | null;
  readonly retryable?: boolean;
  readonly fatal?: boolean;
  readonly attempt?: number | null;
  readonly cause?: unknown;
}

export function crawlError(input: CrawlErrorInput): CrawlError {
  const cause = input.cause;
  return {
    schemaId: "site-crawler.error",
    schemaVersion: 1,
    code: input.code,
    message: input.message,
    url: input.url ?? null,
    requestId: input.requestId ?? null,
    retryable: input.retryable ?? false,
    fatal: input.fatal ?? false,
    attempt: input.attempt ?? null,
    causeName: cause === undefined ? null : errorName(cause),
    causeMessage: cause === undefined ? null : errorMessage(cause),
    createdAt: nowIso(),
  };
}

export function warning(
  code: WarningCode,
  message: string,
  detail: string | null = null,
): CrawlWarning {
  return { code, message, detail, createdAt: nowIso() };
}
