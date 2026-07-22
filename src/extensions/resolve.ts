import type { CrawlerExtensions, ResolvedCrawlerExtensions } from "./types.js";
export function resolveExtensions(
  extensions: CrawlerExtensions | undefined,
): ResolvedCrawlerExtensions {
  const eventBufferCapacity = extensions?.eventBufferCapacity ?? 1024;
  if (!Number.isInteger(eventBufferCapacity) || eventBufferCapacity <= 0) {
    throw new TypeError(
      "extensions.eventBufferCapacity must be a positive integer.",
    );
  }
  return {
    renderer: extensions?.renderer ?? null,
    httpClient: extensions?.httpClient ?? null,
    hooks: extensions?.hooks ?? {},
    middlewares: {
      beforeRequest:
        extensions?.middlewares?.beforeRequest === undefined
          ? []
          : [...extensions.middlewares.beforeRequest],
      afterResource:
        extensions?.middlewares?.afterResource === undefined
          ? []
          : [...extensions.middlewares.afterResource],
    },
    failureMode: extensions?.failureMode ?? "record",
    eventBufferCapacity,
  };
}
