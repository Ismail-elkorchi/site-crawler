import type { ResolvedCrawlConfig } from "../config/types.js";

export function redactConfig(config: ResolvedCrawlConfig): ResolvedCrawlConfig {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.network.headers)) {
    headers[key] = isSecretHeader(key) ? "[redacted]" : value;
  }
  return {
    ...config,
    network: { ...config.network, headers },
    session: {
      ...config.session,
      initialCookies: config.session.initialCookies.map((entry) => ({
        ...entry,
        cookie: "[redacted]",
      })),
      basicAuth: config.session.basicAuth.map((entry) => ({
        ...entry,
        username: "[redacted]",
        password: "[redacted]",
      })),
      bearerAuth: config.session.bearerAuth.map((entry) => ({
        ...entry,
        token: "[redacted]",
      })),
    },
  };
}

function isSecretHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "authorization" ||
    lower === "cookie" ||
    lower === "proxy-authorization"
  );
}
