import type { FaultPoint } from "./types.js";

const counters = new Map<FaultPoint, number>();

class InjectedFaultError extends Error {
  public override readonly name = "InjectedFaultError";
  public readonly point: FaultPoint;

  public constructor(point: FaultPoint) {
    super(`Injected fault at ${point}.`);
    this.point = point;
  }
}

export function faultPoint(point: FaultPoint): void {
  const configured = process.env["SITE_CRAWLER_FAULT_POINT"];
  if (configured === undefined) return;
  const points = configured.split(",").map((value) => value.trim());
  if (!points.includes(point)) return;
  const count = (counters.get(point) ?? 0) + 1;
  counters.set(point, count);
  const after = Number(process.env["SITE_CRAWLER_FAULT_AFTER"] ?? "1");
  if (!Number.isInteger(after) || count < after) return;
  if (process.env["SITE_CRAWLER_FAULT_MODE"] === "exit") {
    process.exit(86);
  }
  throw new InjectedFaultError(point);
}

export function resetFaultCounters(): void {
  counters.clear();
}
