export interface PlaywrightRenderAdapterOptions {
  readonly browser: "chromium" | "firefox" | "webkit";
  readonly executablePath?: string;
  readonly headless?: boolean;
  readonly launchTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly closeTimeoutMs?: number;
  readonly launchArgs?: readonly string[];
  readonly maxConcurrency?: number;
  readonly ignoreHttpsErrors?: boolean;
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly blockedResourceTypes?: readonly (
    | "document"
    | "stylesheet"
    | "image"
    | "media"
    | "font"
    | "script"
    | "texttrack"
    | "xhr"
    | "fetch"
    | "eventsource"
    | "websocket"
    | "manifest"
    | "other"
  )[];
  readonly blockedUrlPatterns?: readonly string[];
  readonly screenshotDirectory?: string | null;
  readonly fullPageScreenshot?: boolean;
  readonly initScripts?: readonly string[];
}
