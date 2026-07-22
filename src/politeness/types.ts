export interface OriginStats {
  readonly origin: string;
  readonly requests: number;
  readonly failures: number;
  readonly averageResponseTimeMs: number;
  readonly averageLatencyMs: number;
  readonly currentDelayMs: number;
  readonly activeRequests: number;
  readonly nextEligibleAt: number;
}

export interface ThrottleChange {
  readonly origin: string;
  readonly previousDelayMs: number;
  readonly delayMs: number;
  readonly reason: "success" | "error" | "robots";
}
