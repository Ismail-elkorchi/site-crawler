import { decodeBody, TextDecodingError } from "../encoding/index.js";
import type { EncodingFact } from "../encoding/types.js";
import type { EvidenceReference } from "../evidence/types.js";
import type { ResponseBody } from "../http/body-types.js";
import { readResponseBody } from "../http/body.js";
import type { CrawlRequest } from "../requests/types.js";
import type { ResourceType } from "../resources/types.js";
import type { ParserDiagnostic } from "../core/types.js";
import type { CrawlWarning } from "../diagnostics/types.js";
import { failedXmlResource } from "./document-extractor.js";
import { extractXmlResource } from "./index.js";
import { XmlEntryDispatcher } from "./entry-dispatcher.js";
import type { XmlResourceContext } from "./extraction-types.js";
import type { XmlResourceProcessorDependencies } from "./processor-types.js";
import type { CrawledXmlResource } from "./types.js";

export type { XmlResourceProcessorDependencies } from "./processor-types.js";

export class XmlResourceProcessor {
  private readonly deps: XmlResourceProcessorDependencies;
  private readonly entries: XmlEntryDispatcher;

  public constructor(deps: XmlResourceProcessorDependencies) {
    this.deps = deps;
    this.entries = new XmlEntryDispatcher(deps);
  }

  public async processBody(
    body: ResponseBody,
    contentType: string | null,
    request: CrawlRequest,
    resourceId: string,
    finalUrl: string,
    encoding: EncodingFact | null,
    resourceType: ResourceType,
    signal: AbortSignal,
  ): Promise<void> {
    const bytes = await readResponseBody(body);
    const evidence = await this.deps.store.writeEvidence(
      request.id,
      "xml",
      contentType ?? "application/xml",
      bytes,
    );
    const initialContext = this.context(
      request,
      resourceId,
      finalUrl,
      encoding,
      evidence,
      [],
    );
    const extracted = this.extractBytes(
      bytes,
      contentType,
      initialContext,
      signal,
    );
    await this.persist(extracted, request, finalUrl, resourceType);
  }

  private context(
    request: CrawlRequest,
    resourceId: string,
    finalUrl: string,
    encoding: EncodingFact | null,
    evidence: EvidenceReference | null,
    decodingWarnings: readonly CrawlWarning[],
  ): XmlResourceContext {
    return {
      runId: this.deps.runId,
      requestId: request.id,
      resourceId,
      requestedUrl: request.normalizedUrl,
      finalUrl,
      normalizedUrl: request.normalizedUrl,
      encoding,
      evidence,
      decodingWarnings,
      config: this.deps.config,
    };
  }

  private extractBytes(
    bytes: Uint8Array,
    contentType: string | null,
    context: XmlResourceContext,
    signal: AbortSignal,
  ): CrawledXmlResource {
    if (signal.aborted) return abortedResource(context, signal.reason);
    const maxInputBytes = this.deps.config.parsing.xml.maxStreamBytes;
    if (bytes.byteLength > maxInputBytes) {
      const status = {
        kind: "budget-exceeded",
        budget: "maxInputBytes",
        limit: maxInputBytes,
        actual: bytes.byteLength,
      } as const;
      return failedXmlResource(
        context,
        parserDiagnostic(
          "XML_BUDGET_EXCEEDED",
          `XML maxInputBytes budget of ${maxInputBytes} was exceeded by ${bytes.byteLength}.`,
        ),
        status,
      );
    }
    try {
      const decoded = decodeBody(bytes, contentType, "xml", { kind: "fatal" });
      if (signal.aborted) return abortedResource(context, signal.reason);
      return extractXmlResource({
        ...context,
        encoding: decoded.encoding,
        decodingWarnings: decoded.warnings,
        xml: decoded.text,
      });
    } catch (caught) {
      if (!(caught instanceof TextDecodingError)) throw caught;
      return failedXmlResource(
        context,
        parserDiagnostic(`XML_${caught.code}`, caught.message),
        {
          kind: "decoding-failed",
          code: caught.code,
          encoding: caught.encoding,
        },
      );
    }
  }

  private async persist(
    extracted: CrawledXmlResource,
    request: CrawlRequest,
    finalUrl: string,
    resourceType: ResourceType,
  ): Promise<void> {
    const xml = this.entries.applyPolicy(extracted);
    this.recordCounters(xml, resourceType);
    await this.deps.store.writeXmlResource(xml);
    await this.invokeHook(xml, request, finalUrl);
    await this.entries.dispatch(xml, request, finalUrl);
  }

  private recordCounters(
    xml: CrawledXmlResource,
    resourceType: ResourceType,
  ): void {
    this.deps.counters.xmlResourcesParsed += 1;
    this.deps.counters.parserErrors += xml.parserDiagnostics.filter(
      (diagnostic) => diagnostic.level === "error",
    ).length;
    if (
      resourceType === "sitemap" ||
      xml.xmlKind === "sitemap" ||
      xml.xmlKind === "sitemap-index"
    )
      this.deps.counters.sitemapsFetched += 1;
    if (xml.xmlKind === "feed") this.deps.counters.feedsFetched += 1;
  }

  private async invokeHook(
    xml: CrawledXmlResource,
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    const hook = this.deps.extensions.hooks.onXmlParsed;
    if (hook === undefined) return;
    await this.deps.extensionRunner.invoke(
      "onXmlParsed hook",
      { scope: "request", url: finalUrl, requestId: request.id },
      async () => {
        await hook(this.deps.context(), xml);
      },
    );
  }
}

function abortedResource(
  context: XmlResourceContext,
  reason: unknown,
): CrawledXmlResource {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "XML parsing was aborted";
  return failedXmlResource(
    context,
    parserDiagnostic("XML_PARSE_ABORTED", message),
    { kind: "aborted", reason: message },
  );
}

function parserDiagnostic(code: string, message: string): ParserDiagnostic {
  return { level: "error", code, message, position: null };
}
