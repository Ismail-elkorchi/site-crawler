import type { CssDiscoveryConfig } from "../css/types.js";
import type { HttpCacheConfig } from "../http/cache/types.js";
import type { NetworkConfig } from "../http/types.js";
import type { SessionConfig } from "../http/session/types.js";
import type { JsDiscoveryConfig } from "../javascript/types.js";
import type { RenderingConfig } from "../rendering/types.js";
import type { StorageConfig } from "../storage/config-types.js";
import type { ScopeConfig } from "../url/types.js";
import type { SitemapConfig } from "../xml/config-types.js";
import {
  defaultCssDiscovery,
  defaultHtmlParsing,
  defaultHttpCache,
  defaultJsDiscovery,
  defaultNetwork,
  defaultRendering,
  defaultScope,
  defaultSession,
  defaultSitemaps,
  defaultStorage,
  defaultXmlParsing,
} from "./defaults.js";
import type {
  NetworkConfigInput,
  ParsingConfig,
  ParsingConfigInput,
} from "./types.js";

export function mergeScope(
  scope: Partial<ScopeConfig> | undefined,
): ScopeConfig {
  return mergeScopeWithBase(defaultScope, scope);
}

export function mergeScopeWithBase(
  base: ScopeConfig,
  patch: Partial<ScopeConfig> | undefined,
): ScopeConfig {
  return {
    ...base,
    ...patch,
    include: patch?.include === undefined ? base.include : [...patch.include],
    exclude: patch?.exclude === undefined ? base.exclude : [...patch.exclude],
    allowedHosts:
      patch?.allowedHosts === undefined
        ? base.allowedHosts
        : [...patch.allowedHosts],
    deniedHosts:
      patch?.deniedHosts === undefined
        ? base.deniedHosts
        : [...patch.deniedHosts],
  };
}

export function mergeSitemaps(
  sitemaps: Partial<SitemapConfig> | undefined,
): SitemapConfig {
  return {
    ...defaultSitemaps,
    ...sitemaps,
    manual:
      sitemaps?.manual === undefined
        ? defaultSitemaps.manual
        : [...sitemaps.manual],
  };
}

export function mergeNetwork(
  network: NetworkConfigInput | undefined,
): NetworkConfig {
  return {
    ...defaultNetwork,
    ...network,
    autoThrottle: {
      ...defaultNetwork.autoThrottle,
      ...network?.autoThrottle,
    },
    headers:
      network?.headers === undefined
        ? defaultNetwork.headers
        : { ...network.headers },
  };
}

export function mergeSession(
  session: Partial<SessionConfig> | undefined,
): SessionConfig {
  return {
    ...defaultSession,
    ...session,
    initialCookies:
      session?.initialCookies === undefined
        ? defaultSession.initialCookies
        : session.initialCookies.map((entry) => ({ ...entry })),
    basicAuth:
      session?.basicAuth === undefined
        ? defaultSession.basicAuth
        : session.basicAuth.map((entry) => ({ ...entry })),
    bearerAuth:
      session?.bearerAuth === undefined
        ? defaultSession.bearerAuth
        : session.bearerAuth.map((entry) => ({ ...entry })),
  };
}

export function mergeHttpCache(
  cache: Partial<HttpCacheConfig> | undefined,
): HttpCacheConfig {
  return { ...defaultHttpCache, ...cache };
}

export function mergeJavascript(
  input: Partial<JsDiscoveryConfig> | undefined,
): JsDiscoveryConfig {
  return { ...defaultJsDiscovery, ...input };
}

export function mergeCss(
  input: Partial<CssDiscoveryConfig> | undefined,
): CssDiscoveryConfig {
  return { ...defaultCssDiscovery, ...input };
}

export function mergeRendering(
  rendering: Partial<RenderingConfig> | undefined,
): RenderingConfig {
  return {
    ...defaultRendering,
    ...rendering,
    autoRenderUrlPatterns:
      rendering?.autoRenderUrlPatterns === undefined
        ? defaultRendering.autoRenderUrlPatterns
        : [...rendering.autoRenderUrlPatterns],
  };
}

export function mergeStorage(
  storage: Partial<StorageConfig> | undefined,
): StorageConfig {
  const type = storage?.type ?? defaultStorage.type;
  const frontierBackend =
    storage?.frontierBackend ?? defaultFrontierBackend(type);
  return { ...defaultStorage, ...storage, type, frontierBackend };
}

export function mergeParsing(
  parsing: ParsingConfigInput | undefined,
): ParsingConfig {
  return {
    html: { ...defaultHtmlParsing, ...parsing?.html },
    xml: { ...defaultXmlParsing, ...parsing?.xml },
  };
}

function defaultFrontierBackend(
  type: StorageConfig["type"],
): StorageConfig["frontierBackend"] {
  if (type === "memory") return "memory";
  if (type === "filesystem") return "journal";
  return "sqlite";
}
