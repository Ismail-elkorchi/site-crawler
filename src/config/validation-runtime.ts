import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { ResolvedCrawlConfig } from "./types.js";

export function validateRuntimeConfig(
  config: ResolvedCrawlConfig,
  extensions: ResolvedCrawlerExtensions | undefined,
): void {
  positive(config.storage.writeBufferSize, "storage.writeBufferSize");
  if (config.storage.sqliteFileName.trim().length === 0) {
    throw new Error("storage.sqliteFileName must not be empty.");
  }
  if (
    config.storage.type === "memory" &&
    config.storage.frontierBackend !== "memory"
  ) {
    throw new Error(
      "Memory result storage requires the memory frontier backend.",
    );
  }
  if (config.session.persistCookies && !config.session.enabled) {
    throw new Error(
      "session.persistCookies requires session.enabled to be true.",
    );
  }
  if (config.session.persistCookies && config.storage.type === "memory") {
    throw new Error(
      "Persistent cookies require filesystem-backed crawl storage.",
    );
  }
  if (
    config.session.cookieFile !== null &&
    config.session.cookieFile.trim().length === 0
  ) {
    throw new Error("session.cookieFile must not be empty.");
  }
  positive(config.storage.leaseDurationMs, "storage.leaseDurationMs");
  positive(
    config.storage.leaseRenewalIntervalMs,
    "storage.leaseRenewalIntervalMs",
  );
  if (config.storage.leaseRenewalIntervalMs >= config.storage.leaseDurationMs) {
    throw new Error(
      "storage.leaseRenewalIntervalMs must be smaller than storage.leaseDurationMs.",
    );
  }
  positive(config.storage.lockHeartbeatMs, "storage.lockHeartbeatMs");
  positive(config.storage.staleLockMs, "storage.staleLockMs");
  if (config.storage.lockHeartbeatMs >= config.storage.staleLockMs) {
    throw new Error(
      "storage.lockHeartbeatMs must be smaller than storage.staleLockMs.",
    );
  }
  if (config.rendering.mode !== "never" && extensions?.renderer === null) {
    throw new Error(
      "A render adapter is required when rendering.mode is not 'never'.",
    );
  }
}

function positive(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}
