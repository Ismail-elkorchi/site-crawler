import type { BrowserContext } from "playwright-core";
import type { RenderCookie } from "../types.js";

export async function readRenderCookies(
  context: BrowserContext,
): Promise<readonly RenderCookie[]> {
  return (await context.cookies()).map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }));
}
