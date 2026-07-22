import type { CrawlError } from "../diagnostics/types.js";
import type { ExtensionFailureMode } from "./types.js";

export class ExtensionFailure extends Error {
  public override readonly name = "ExtensionFailure";
  public readonly extensionName: string;
  public readonly mode: ExtensionFailureMode;
  public readonly crawlError: CrawlError;

  public constructor(
    extensionName: string,
    mode: ExtensionFailureMode,
    crawlError: CrawlError,
  ) {
    super(`${extensionName} failed: ${crawlError.message}`);
    this.extensionName = extensionName;
    this.mode = mode;
    this.crawlError = crawlError;
  }
}
