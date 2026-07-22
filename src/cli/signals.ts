import type { SiteCrawler } from "../crawler/SiteCrawler.js";

export function installSignalHandlers(crawler: SiteCrawler): () => void {
  let signals = 0;
  const handler = (signal: NodeJS.Signals): void => {
    signals += 1;
    if (signals === 1) {
      crawler.abort(`Received ${signal}`);
      return;
    }
    remove();
    process.kill(process.pid, signal);
  };
  const remove = (): void => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return remove;
}
