import { err, ok, type Result } from "../core/utils.js";
import type { NormalizedUrl } from "./types.js";
export function normalizeUrl(
  rawUrl: string,
  baseUrl: string | null = null,
): Result<NormalizedUrl, string> {
  let parsed: URL;
  try {
    parsed = baseUrl === null ? new URL(rawUrl) : new URL(rawUrl, baseUrl);
  } catch {
    return err("Invalid URL");
  }
  if (parsed.username !== "" || parsed.password !== "")
    return err("URLs containing credentials are rejected.");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return err(`Unsupported protocol: ${parsed.protocol}`);
  parsed.hash = "";
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  )
    parsed.port = "";
  return ok({
    rawUrl,
    baseUrl,
    resolvedUrl: parsed.href,
    normalizedUrl: parsed.href,
    displayUrl: parsed.href,
  });
}
