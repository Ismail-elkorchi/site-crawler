import fs from "node:fs/promises";
import path from "node:path";
import { CookieJar, type Cookie } from "tough-cookie";
import {
  ensurePrivateDirectory,
  protectPrivateFile,
  writePrivateFileAtomic,
} from "../../core/private-files.js";
import type { RenderCookie } from "../../rendering/types.js";
import { renderCookieForJar } from "./render-cookies.js";
import type { SessionConfig } from "./types.js";

export class SessionManager {
  private jar = new CookieJar();
  private initialized: Promise<void> | null = null;
  private readonly config: SessionConfig;

  public constructor(config: SessionConfig) {
    this.config = config;
  }

  public async requestHeaders(
    url: string,
    input: Readonly<Record<string, string>>,
  ): Promise<Readonly<Record<string, string>>> {
    if (!this.config.enabled) return { ...input };
    await this.ensureInitialized();
    const headers: Record<string, string> = { ...input };
    const cookie = await this.jar.getCookieString(url);
    if (cookie !== "" && !hasHeader(headers, "cookie"))
      headers["cookie"] = cookie;
    if (!hasHeader(headers, "authorization")) {
      const authorization = this.authorizationFor(url);
      if (authorization !== null) headers["authorization"] = authorization;
    }
    return headers;
  }

  public async capture(url: string, headers: Headers): Promise<void> {
    if (!this.config.enabled) return;
    await this.ensureInitialized();
    for (const value of headers.getSetCookie()) {
      await this.jar.setCookie(value, url, { ignoreError: true });
    }
  }

  public async renderCookies(url: string): Promise<readonly RenderCookie[]> {
    if (!this.config.enabled) return [];
    await this.ensureInitialized();
    const cookies = await this.jar.getCookies(url);
    return cookies.map(toRenderCookie);
  }

  public async captureRenderCookies(
    url: string,
    cookies: readonly RenderCookie[],
  ): Promise<void> {
    if (!this.config.enabled || cookies.length === 0) return;
    await this.ensureInitialized();
    for (const cookie of cookies) {
      await this.jar.setCookie(renderCookieForJar(cookie, url), url, {
        ignoreError: true,
      });
    }
  }

  public async close(): Promise<void> {
    if (!this.config.enabled || !this.config.persistCookies) return;
    await this.ensureInitialized();
    if (this.config.cookieFile === null) return;
    await writePrivateFileAtomic(
      this.config.cookieFile,
      `${JSON.stringify(await this.jar.serialize(), null, 2)}\n`,
      false,
    );
  }

  private async ensureInitialized(): Promise<void> {
    this.initialized ??= this.initialize();
    await this.initialized;
  }

  private async initialize(): Promise<void> {
    if (this.config.persistCookies && this.config.cookieFile !== null) {
      await ensurePrivateDirectory(path.dirname(this.config.cookieFile));
      if (await exists(this.config.cookieFile)) {
        await protectPrivateFile(this.config.cookieFile);
      }
      const restored = await readJar(this.config.cookieFile);
      if (restored !== null) this.jar = restored;
    }
    for (const initial of this.config.initialCookies) {
      await this.jar.setCookie(initial.cookie, initial.url);
    }
  }

  private authorizationFor(url: string): string | null {
    const origin = new URL(url).origin;
    const bearer = this.config.bearerAuth.find(
      (credential) => credential.origin === origin,
    );
    if (bearer !== undefined) return `Bearer ${bearer.token}`;
    const basic = this.config.basicAuth.find(
      (credential) => credential.origin === origin,
    );
    if (basic === undefined) return null;
    const encoded = Buffer.from(
      `${basic.username}:${basic.password}`,
      "utf8",
    ).toString("base64");
    return `Basic ${encoded}`;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJar(filePath: string): Promise<CookieJar | null> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed))
      throw new Error("Cookie file must contain an object.");
    return await CookieJar.deserialize(parsed);
  } catch (caught) {
    if (isMissingFile(caught)) return null;
    throw caught;
  }
}

function toRenderCookie(cookie: Cookie): RenderCookie {
  return {
    name: cookie.key,
    value: cookie.value,
    domain: cookie.domain ?? "",
    path: cookie.path ?? "/",
    expires: expirationSeconds(cookie),
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: normalizeSameSite(cookie.sameSite),
  };
}

function expirationSeconds(cookie: Cookie): number {
  if (!(cookie.expires instanceof Date)) return -1;
  return Math.floor(cookie.expires.getTime() / 1000);
}

function normalizeSameSite(
  value: Cookie["sameSite"],
): RenderCookie["sameSite"] {
  if (value === "strict") return "Strict";
  if (value === "none") return "None";
  return "Lax";
}

function hasHeader(
  headers: Readonly<Record<string, string>>,
  name: string,
): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(value: unknown): boolean {
  return value instanceof Error && "code" in value && value.code === "ENOENT";
}
