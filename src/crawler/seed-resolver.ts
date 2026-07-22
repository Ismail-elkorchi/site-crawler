import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
export class SeedResolver {
  private readonly seeds: readonly ResolvedSeed[];
  public constructor(seeds: readonly ResolvedSeed[]) {
    this.seeds = seeds;
  }
  public forRequest(request: CrawlRequest): ResolvedSeed | null {
    return this.forUrl(request.normalizedUrl);
  }
  public forUrl(url: string): ResolvedSeed | null {
    const exact =
      this.seeds.find(
        (seed) => seed.normalizedUrl === url || seed.url === url,
      ) ?? null;
    if (exact !== null) return exact;
    return (
      this.seeds.find((seed) => sameOrigin(seed.normalizedUrl, url)) ?? null
    );
  }
  public first(): ResolvedSeed | null {
    return this.seeds[0] ?? null;
  }
}
function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}
