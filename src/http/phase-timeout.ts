export type HttpTimeoutPhase = "connect" | "first-byte";

export class HttpPhaseTimeoutError extends Error {
  public readonly phase: HttpTimeoutPhase;

  public constructor(phase: HttpTimeoutPhase) {
    super(
      phase === "connect"
        ? "Connection establishment timed out"
        : "Waiting for the first response byte timed out",
    );
    this.name = "HttpPhaseTimeoutError";
    this.phase = phase;
  }
}
