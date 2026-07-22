import { isHtmlLike, isXmlLike } from "../classification/index.js";
import { CssResourceProcessor } from "../css/resource-processor.js";
import { HtmlResourceProcessor } from "../html/html-resource-processor.js";
import { disposeResponseBody } from "../http/body.js";
import type { FetchResult } from "../http/index.js";
import { JavascriptResourceProcessor } from "../javascript/resource-processor.js";
import type { NetworkSafetyDecision } from "../network/types.js";
import { RenderController } from "../rendering/controller.js";
import type { CrawlRequest } from "../requests/types.js";
import type { RobotsDecision } from "../robots/types.js";
import type { ScopeDecision } from "../url/types.js";
import { XmlResourceProcessor } from "../xml/xml-resource-processor.js";
import { HeaderLinkProcessor } from "./header-link-processor.js";
import type { ResourceProcessingDependencies } from "./processor-types.js";
import {
  prepareFetchedResource,
  type PreparedResource,
} from "./resource-record.js";
import { TextAssetProcessor } from "./text-asset-processor.js";
import type { CrawledResource } from "./types.js";

export class ResourceProcessor {
  private readonly renderer: RenderController;
  private readonly html: HtmlResourceProcessor;
  private readonly xml: XmlResourceProcessor;
  private readonly textAssets: TextAssetProcessor;
  private readonly headerLinks: HeaderLinkProcessor;
  private readonly deps: ResourceProcessingDependencies;

  public constructor(deps: ResourceProcessingDependencies) {
    this.deps = deps;
    this.renderer = new RenderController({
      runId: deps.runId,
      config: deps.config,
      renderer: deps.extensions.renderer,
      store: deps.store,
      session: deps.session,
    });
    this.html = new HtmlResourceProcessor({ ...deps, renderer: this.renderer });
    this.xml = new XmlResourceProcessor(deps);
    this.textAssets = new TextAssetProcessor({
      config: deps.config,
      javascript: new JavascriptResourceProcessor(deps),
      css: new CssResourceProcessor(deps),
    });
    this.headerLinks = new HeaderLinkProcessor(deps);
  }

  public renderedPageCount(): number {
    return this.renderer.renderedPageCount();
  }

  public async processFetchedResource(
    request: CrawlRequest,
    fetchResult: FetchResult,
    scopeDecision: ScopeDecision,
    robotsDecision: RobotsDecision,
    safetyDecision: NetworkSafetyDecision,
    signal: AbortSignal,
  ): Promise<void> {
    let prepared: PreparedResource | null = null;
    try {
      prepared = await prepareFetchedResource({
        request,
        fetchResult,
        scopeDecision,
        robotsDecision,
        networkSafetyDecision: safetyDecision,
        runId: this.deps.runId,
        config: this.deps.config,
        signal,
      });
      await this.processPrepared(request, fetchResult, prepared, signal);
    } finally {
      if (prepared?.payloadOwned === true)
        await disposeResponseBody(prepared.payloadBody);
      await disposeResponseBody(fetchResult.body);
    }
  }

  private async processPrepared(
    request: CrawlRequest,
    fetchResult: FetchResult,
    prepared: PreparedResource,
    signal: AbortSignal,
  ): Promise<void> {
    if (prepared.encoding?.hadReplacementChars === true)
      this.deps.counters.decodeErrors += 1;
    this.deps.counters.resourcesRecorded += 1;
    await this.deps.store.writeResource(prepared.resource);
    if (prepared.preparationError !== null) {
      await this.deps.store.writeError(prepared.preparationError);
      return;
    }
    this.emitClassification(request, prepared);
    const middleware = await this.deps.afterResource(prepared.resource);
    if (middleware !== "continue") return;
    await this.invokeAfterResponse(request, prepared.resource);
    await this.headerLinks.process(
      fetchResult.headers.get("link"),
      prepared.finalUrl,
      request,
    );
    if (prepared.payloadBody === null) return;
    await this.processPayload(request, fetchResult, prepared, signal);
  }

  private async processPayload(
    request: CrawlRequest,
    fetchResult: FetchResult,
    prepared: PreparedResource,
    signal: AbortSignal,
  ): Promise<void> {
    const body = prepared.payloadBody;
    if (body === null) return;
    if (isHtmlLike(prepared.resourceType)) {
      await this.html.processBody(
        body,
        request,
        prepared.resourceId,
        prepared.finalUrl,
        prepared.contentType,
        prepared.encoding,
        fetchResult.headers.get("x-robots-tag"),
        signal,
      );
      return;
    }
    if (isXmlLike(prepared.resourceType)) {
      await this.xml.processBody(
        body,
        prepared.contentType,
        request,
        prepared.resourceId,
        prepared.finalUrl,
        prepared.encoding,
        prepared.resourceType,
        signal,
      );
      return;
    }
    await this.textAssets.process(
      prepared.resourceType,
      body,
      prepared.contentType,
      request,
      prepared.finalUrl,
    );
  }

  private emitClassification(
    request: CrawlRequest,
    prepared: PreparedResource,
  ): void {
    this.deps.emit({
      type: "resource-classified",
      runId: this.deps.runId,
      requestId: request.id,
      resourceType: prepared.resourceType,
      createdAt: prepared.resource.fetchedAt,
    });
  }

  private async invokeAfterResponse(
    request: CrawlRequest,
    resource: CrawledResource,
  ): Promise<void> {
    const hook = this.deps.extensions.hooks.afterResponse;
    if (hook === undefined) return;
    await this.deps.extensionRunner.invoke(
      "afterResponse hook",
      {
        scope: "request",
        url: resource.finalUrl ?? resource.normalizedUrl,
        requestId: request.id,
      },
      async () => {
        await hook(this.deps.context(), resource);
      },
    );
  }
}
