import type { Page, Request } from "playwright-core";
import type { RenderNetworkError } from "../types.js";

export class PageObserver {
  public readonly consoleErrors: string[] = [];
  public readonly pageErrors: string[] = [];
  public readonly networkErrors: RenderNetworkError[] = [];

  public attach(page: Page): void {
    page.on("console", (message) => {
      if (message.type() === "error") this.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => this.pageErrors.push(error.message));
    page.on("requestfailed", (request) =>
      this.networkErrors.push(failed(request)),
    );
  }
}

function failed(request: Request): RenderNetworkError {
  return {
    url: request.url(),
    errorText: request.failure()?.errorText ?? "Unknown network failure",
  };
}
