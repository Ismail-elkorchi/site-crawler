import type { Route } from "playwright-core";
import { globishToRegExp } from "../../core/utils.js";
import type { PlaywrightRenderAdapterOptions } from "./types.js";

export function createRoutePolicy(
  options: PlaywrightRenderAdapterOptions,
): (route: Route) => Promise<void> {
  const types: ReadonlySet<string> = new Set(
    options.blockedResourceTypes ?? [],
  );
  const patterns = (options.blockedUrlPatterns ?? []).map(globishToRegExp);
  return async (route) => {
    const request = route.request();
    const blocked =
      types.has(request.resourceType()) ||
      patterns.some((pattern) => pattern.test(request.url()));
    if (blocked) await route.abort("blockedbyclient");
    else await route.continue();
  };
}
