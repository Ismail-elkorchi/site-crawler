import type { ResolvedCrawlConfig } from "../config/types.js";
import { decodeResponseBody } from "../encoding/body-decode.js";
import type { ResponseBody } from "../http/body-types.js";
import type { JavascriptResourceProcessor } from "../javascript/resource-processor.js";
import type { CrawlRequest } from "../requests/types.js";
import type { CssResourceProcessor } from "../css/resource-processor.js";
import type { ResourceType } from "./types.js";

export interface TextAssetProcessorDependencies {
  readonly config: ResolvedCrawlConfig;
  readonly javascript: JavascriptResourceProcessor;
  readonly css: CssResourceProcessor;
}

export class TextAssetProcessor {
  private readonly deps: TextAssetProcessorDependencies;

  public constructor(deps: TextAssetProcessorDependencies) {
    this.deps = deps;
  }

  public async process(
    resourceType: ResourceType,
    body: ResponseBody,
    contentType: string | null,
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    if (resourceType === "javascript" && this.deps.config.jsDiscovery.enabled) {
      const decoded = await decodeResponseBody(
        body,
        contentType,
        "text",
        this.deps.config.jsDiscovery.maxScriptBytes,
        { kind: "replacement" },
      );
      await this.deps.javascript.process(decoded.text, request, finalUrl);
      return;
    }
    if (resourceType === "css" && this.deps.config.cssDiscovery.enabled) {
      const decoded = await decodeResponseBody(
        body,
        contentType,
        "text",
        this.deps.config.cssDiscovery.maxStylesheetBytes,
        { kind: "replacement" },
      );
      await this.deps.css.process(decoded.text, request, finalUrl);
    }
  }
}
