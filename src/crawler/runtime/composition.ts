import type { CrawlConfig } from "../../config/types.js";
import type { CrawlerExtensions } from "../../extensions/types.js";
import type { RuntimeComponents } from "./components.js";
import { createRuntimeExecution } from "./execution.js";
import { createRuntimeFoundation } from "./foundation.js";
import { createRuntimeIdentity } from "./identity.js";

export function composeCrawlerRuntime(
  input: CrawlConfig,
  extensions: CrawlerExtensions | undefined,
): RuntimeComponents {
  return createRuntimeExecution(
    createRuntimeFoundation(createRuntimeIdentity(input, extensions)),
  );
}
