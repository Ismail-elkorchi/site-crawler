import type { CrawlConfig } from "../config/types.js";
import type { CrawlEventSubscription } from "../events/index.js";
import type { CrawlerExtensions } from "../extensions/types.js";
import type { CrawlResult } from "../results/types.js";
import { CrawlerRuntime } from "./runtime.js";
export class SiteCrawler {
  private readonly runtime: CrawlerRuntime;
  public constructor(config: CrawlConfig, extensions?: CrawlerExtensions) {
    this.runtime = new CrawlerRuntime(config, extensions);
  }
  public events(): CrawlEventSubscription {
    return this.runtime.events();
  }
  public run(): Promise<CrawlResult> {
    return this.runtime.run();
  }
  public abort(reason: string): void {
    this.runtime.abort(reason);
  }
}
