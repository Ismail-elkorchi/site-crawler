import type { EncodingFact } from "../encoding/types.js";
import type { EvidenceReference } from "../evidence/types.js";
import type { ResponseBody } from "../http/body-types.js";
import { readResponseBody } from "../http/body.js";
import type { CrawlRequest } from "../requests/types.js";
import { extractHtmlBodyFacts } from "./body-parser.js";
import { extractHtmlFacts } from "./index.js";
import { HtmlPagePersister } from "./page-persister.js";
import type { HtmlResourceProcessorDependencies } from "./processor-types.js";
import type { HtmlExtractionResult } from "./types.js";

export type { HtmlResourceProcessorDependencies } from "./processor-types.js";

export class HtmlResourceProcessor {
  private readonly deps: HtmlResourceProcessorDependencies;
  private readonly pages: HtmlPagePersister;

  public constructor(deps: HtmlResourceProcessorDependencies) {
    this.deps = deps;
    this.pages = new HtmlPagePersister(deps);
  }

  public async processBody(
    body: ResponseBody,
    request: CrawlRequest,
    resourceId: string,
    finalUrl: string,
    contentType: string | null,
    encoding: EncodingFact | null,
    xRobotsTag: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    const initial = await extractHtmlBodyFacts(
      body,
      finalUrl,
      this.deps.config,
      encoding,
      xRobotsTag,
    );
    const evidence = await this.snapshotSource(body, contentType, request.id);
    await this.processExtraction(
      initial,
      evidence,
      request,
      resourceId,
      finalUrl,
      encoding,
      xRobotsTag,
      signal,
    );
  }

  private async snapshotSource(
    body: ResponseBody,
    contentType: string | null,
    requestId: string,
  ): Promise<EvidenceReference | null> {
    return await this.deps.store.writeEvidence(
      requestId,
      "html",
      contentType ?? "text/html",
      await readResponseBody(body),
    );
  }

  private async processExtraction(
    initial: HtmlExtractionResult,
    evidence: EvidenceReference | null,
    request: CrawlRequest,
    resourceId: string,
    finalUrl: string,
    encoding: EncodingFact | null,
    xRobotsTag: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.deps.renderer.shouldRender(request, initial)) {
      await this.pages.persist(
        initial,
        evidence,
        request,
        resourceId,
        finalUrl,
        "http",
      );
      return;
    }
    const rendered = await this.deps.renderer.render(request, finalUrl, signal);
    if (rendered === null) {
      await this.pages.persist(
        initial,
        evidence,
        request,
        resourceId,
        finalUrl,
        "http",
      );
      return;
    }
    const renderedExtraction = extractHtmlFacts(
      rendered.html,
      rendered.finalUrl,
      this.deps.config,
      { encoding, xRobotsTag },
    );
    const renderedEvidence = await this.deps.store.writeEvidence(
      request.id,
      "rendered-html",
      "text/html; charset=utf-8",
      new TextEncoder().encode(rendered.html),
    );
    await this.pages.persist(
      renderedExtraction,
      renderedEvidence,
      request,
      resourceId,
      rendered.finalUrl,
      "rendered",
    );
  }
}
