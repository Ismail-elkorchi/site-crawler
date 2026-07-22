import { nowIso } from "../core/utils.js";
import type { RedirectHop } from "../resources/types.js";
import type { FetchOptions } from "./types.js";

export function createRedirectHop(
  fromUrl: string,
  toUrl: string,
  statusCode: number,
  hopIndex: number,
  validTarget: boolean,
  decision: Awaited<ReturnType<FetchOptions["onRedirectTarget"]>> | null,
): RedirectHop {
  return {
    fromUrl,
    toUrl,
    statusCode,
    hopIndex,
    validTarget,
    scopeAllowed: decision?.scopeAllowed ?? null,
    robotsAllowed: decision?.robotsAllowed ?? null,
    networkSafetyAllowed: decision?.networkSafetyAllowed ?? null,
    timestamp: nowIso(),
  };
}
