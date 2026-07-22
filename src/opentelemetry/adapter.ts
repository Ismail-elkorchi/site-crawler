import type { CrawlEvent } from "../events/types.js";
import type { CrawlerHooks } from "../extensions/types.js";
import type {
  OpenTelemetryCrawlAdapterOptions,
  TelemetryAttributes,
  TelemetryCounter,
  TelemetryHistogram,
  TelemetrySpan,
} from "./types.js";

const STATUS_OK = 1;
const STATUS_ERROR = 2;

export function createOpenTelemetryHooks(
  options: OpenTelemetryCrawlAdapterOptions,
): Pick<CrawlerHooks, "onEvent"> {
  const observer = new CrawlTelemetryObserver(options);
  return {
    onEvent(_context, event) {
      observer.observe(event);
    },
  };
}

class CrawlTelemetryObserver {
  private readonly prefix: string;
  private readonly requests: TelemetryCounter | null;
  private readonly retries: TelemetryCounter | null;
  private readonly errors: TelemetryCounter | null;
  private readonly throttle: TelemetryHistogram | null;
  private readonly renderDuration: TelemetryHistogram | null;
  private readonly tracer: OpenTelemetryCrawlAdapterOptions["tracer"];
  private runSpan: TelemetrySpan | null = null;

  public constructor(options: OpenTelemetryCrawlAdapterOptions) {
    this.prefix = options.attributePrefix ?? "site_crawler";
    this.tracer = options.tracer;
    this.requests =
      options.meter?.createCounter("site_crawler.requests", {
        description: "Crawler request terminal outcomes.",
      }) ?? null;
    this.retries =
      options.meter?.createCounter("site_crawler.retries", {
        description: "Crawler request retries.",
      }) ?? null;
    this.errors =
      options.meter?.createCounter("site_crawler.errors", {
        description: "Crawler request and run errors.",
      }) ?? null;
    this.throttle =
      options.meter?.createHistogram("site_crawler.throttle.delay", {
        description: "Adaptive per-origin crawl delay.",
        unit: "ms",
      }) ?? null;
    this.renderDuration =
      options.meter?.createHistogram("site_crawler.render.duration", {
        description: "Browser rendering duration.",
        unit: "ms",
      }) ?? null;
  }

  public observe(event: CrawlEvent): void {
    if (event.type === "run-started") this.startRun(event);
    else if (event.type === "run-finished") this.finishRun(event);
    else if (event.type === "request-finished") {
      this.requests?.add(
        1,
        attributes(event.runId, { outcome: event.outcome }),
      );
    } else if (event.type === "retry-scheduled") {
      this.retries?.add(1, attributes(event.runId, { attempt: event.attempt }));
    } else if (event.type === "request-failed") {
      this.errors?.add(1, attributes(event.runId, { code: event.code }));
    } else if (event.type === "throttle-changed") {
      this.throttle?.record(
        event.delayMs,
        attributes(event.runId, { origin: event.origin, reason: event.reason }),
      );
    } else if (event.type === "render-finished") {
      this.renderDuration?.record(
        event.durationMs,
        attributes(event.runId, { success: event.success }),
      );
    }
  }

  private startRun(
    event: Extract<CrawlEvent, { readonly type: "run-started" }>,
  ): void {
    this.runSpan =
      this.tracer?.startSpan("site-crawler.run", {
        attributes: attributes(event.runId),
      }) ?? null;
  }

  private finishRun(
    event: Extract<CrawlEvent, { readonly type: "run-finished" }>,
  ): void {
    const span = this.runSpan;
    if (span === null) return;
    span.setAttribute(`${this.prefix}.status`, event.status);
    span.setAttribute(`${this.prefix}.stop_reason`, event.stopReason ?? "none");
    if (event.status === "failed") {
      span.setStatus({ code: STATUS_ERROR, message: "Crawler run failed" });
    } else {
      span.setStatus({ code: STATUS_OK });
    }
    span.end();
    this.runSpan = null;
  }
}

function attributes(
  runId: string,
  extra: TelemetryAttributes = {},
): TelemetryAttributes {
  return { "site_crawler.run_id": runId, ...extra };
}
