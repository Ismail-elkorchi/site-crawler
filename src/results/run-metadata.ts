import type { NetworkConfig } from "../http/types.js";
import type { FrontierOrder } from "../scheduling/types.js";
import type {
  FrontierBackendType,
  ResultStorageType,
} from "../storage/config-types.js";

export interface RendererMetadata {
  readonly name: string;
  readonly version: string | null;
}

export interface RunRuntimeMetadata {
  readonly resultStorage: ResultStorageType;
  readonly frontierBackend: FrontierBackendType;
  readonly frontierOrder: FrontierOrder;
  readonly httpProtocolPreference: NetworkConfig["protocolPreference"];
  readonly httpCacheEnabled: boolean;
  readonly sessionEnabled: boolean;
  readonly persistedCookies: boolean;
  readonly renderer: RendererMetadata | null;
}
