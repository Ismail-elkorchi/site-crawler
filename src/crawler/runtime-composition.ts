import type { CrawlConfig } from "../config/types.js";
import type { CrawlerExtensions } from "../extensions/types.js";
import type { RuntimeComponents } from "./runtime-components.js";
import { createRuntimeExecution } from "./runtime-execution.js";
import { createRuntimeFoundation } from "./runtime-foundation.js";
import { createRuntimeIdentity } from "./runtime-identity.js";

export function composeCrawlerRuntime(
  input: CrawlConfig,
  extensions: CrawlerExtensions | undefined,
): RuntimeComponents {
  return createRuntimeExecution(
    createRuntimeFoundation(createRuntimeIdentity(input, extensions)),
  );
}
