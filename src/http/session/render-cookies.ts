import { Cookie } from "tough-cookie";
import type { RenderCookie } from "../../rendering/types.js";

export function renderCookieForJar(cookie: RenderCookie, url: string): Cookie {
  const base = {
    key: cookie.name,
    value: cookie.value,
    path: cookie.path,
    expires:
      cookie.expires < 0
        ? ("Infinity" as const)
        : new Date(cookie.expires * 1_000),
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: normalizedSameSite(cookie.sameSite),
  };
  const host = new URL(url).hostname.toLowerCase();
  const cookieDomain = cookie.domain.replace(/^\./u, "").toLowerCase();
  return cookieDomain === host
    ? new Cookie(base)
    : new Cookie({ ...base, domain: cookie.domain });
}

function normalizedSameSite(
  value: RenderCookie["sameSite"],
): "strict" | "lax" | "none" {
  if (value === "Strict") return "strict";
  if (value === "None") return "none";
  return "lax";
}
