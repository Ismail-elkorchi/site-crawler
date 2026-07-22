export type TelemetryAttributeValue = string | number | boolean;
export type TelemetryAttributes = Readonly<
  Record<string, TelemetryAttributeValue>
>;

export interface TelemetryCounter {
  add(value: number, attributes?: TelemetryAttributes): void;
}

export interface TelemetryHistogram {
  record(value: number, attributes?: TelemetryAttributes): void;
}

export interface TelemetryMeter {
  createCounter(
    name: string,
    options?: { readonly description?: string },
  ): TelemetryCounter;
  createHistogram(
    name: string,
    options?: { readonly description?: string; readonly unit?: string },
  ): TelemetryHistogram;
}

export interface TelemetrySpan {
  setAttribute(name: string, value: TelemetryAttributeValue): this;
  recordException(error: Error): void;
  setStatus(status: { readonly code: number; readonly message?: string }): this;
  end(endTime?: number): void;
}

export interface TelemetryTracer {
  startSpan(
    name: string,
    options?: { readonly attributes?: TelemetryAttributes },
  ): TelemetrySpan;
}

export interface OpenTelemetryCrawlAdapterOptions {
  readonly tracer?: TelemetryTracer;
  readonly meter?: TelemetryMeter;
  readonly attributePrefix?: string;
}
