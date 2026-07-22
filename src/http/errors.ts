import type { CrawlError } from "../diagnostics/types.js";
import { HttpPhaseTimeoutError } from "./phase-timeout.js";

export function classifyTransportError(
  error: Error,
  externallyAborted: boolean,
  timedOut: boolean,
): Pick<CrawlError, "code" | "message" | "retryable"> {
  if (error instanceof HttpPhaseTimeoutError) {
    return {
      code:
        error.phase === "connect"
          ? "FETCH_CONNECT_TIMEOUT"
          : "FETCH_FIRST_BYTE_TIMEOUT",
      message: error.message,
      retryable: true,
    };
  }
  if (externallyAborted) {
    return {
      code: "FETCH_ABORTED",
      message: "Request was aborted",
      retryable: false,
    };
  }
  if (timedOut) {
    return {
      code: "FETCH_TIMEOUT",
      message: "Request timed out",
      retryable: true,
    };
  }
  if (isTlsError(error)) {
    return {
      code: "TLS_ERROR",
      message: "TLS request failed",
      retryable: false,
    };
  }
  return {
    code: "FETCH_NETWORK_ERROR",
    message: "Network request failed",
    retryable: true,
  };
}

export function remapBodyAbort(
  error: CrawlError | null,
  externalSignal: AbortSignal | undefined,
): CrawlError | null {
  if (error?.code !== "FETCH_ABORTED" || externalSignal?.aborted !== true) {
    return error;
  }
  return { ...error, message: "Request was aborted by the caller" };
}

const TLS_ERROR_CODES: ReadonlySet<string> = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_SSL_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function isTlsError(error: Error): boolean {
  return TLS_ERROR_CODES.has(errorCode(error) ?? "");
}

function errorCode(error: Error): string | null {
  if (!("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}
