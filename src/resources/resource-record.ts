import { classifyResponse, isXmlLike } from "../classification/index.js";
import { makeId } from "../core/utils.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { EncodingFact } from "../encoding/types.js";
import type { ResponseBody } from "../http/body-types.js";
import { responseBodyPrefix } from "../http/body.js";
import { prepareXmlBody } from "../xml/body.js";
import { createResource } from "./resource-factory.js";
import type { ResourceDecisionInputs } from "./resource-inputs.js";
import { inspectPayload } from "./resource-inspection.js";
import type { CrawledResource, ResourceType } from "./types.js";

export interface PreparedResource {
  readonly resourceId: string;
  readonly resource: CrawledResource;
  readonly resourceType: ResourceType;
  readonly finalUrl: string;
  readonly contentType: string | null;
  readonly payloadBody: ResponseBody | null;
  readonly payloadOwned: boolean;
  readonly encoding: EncodingFact | null;
  readonly preparationError: CrawlError | null;
}

export type { ResourceDecisionInputs } from "./resource-inputs.js";

export async function prepareFetchedResource(
  inputs: ResourceDecisionInputs,
): Promise<PreparedResource> {
  const originalBody = inputs.fetchResult.body;
  const bodyStart =
    originalBody === null
      ? new Uint8Array()
      : await responseBodyPrefix(originalBody, 1024);
  const finalUrl = inputs.fetchResult.finalUrl ?? inputs.request.normalizedUrl;
  const contentType = inputs.fetchResult.headers.get("content-type");
  const resourceType = classifyResponse({
    url: finalUrl,
    statusCode: inputs.fetchResult.statusCode,
    contentType,
    bodyStart,
  });
  const payload =
    originalBody !== null && isXmlLike(resourceType)
      ? await prepareXmlBody(
          originalBody,
          inputs.config.responseLimits,
          finalUrl,
          inputs.request.id,
          inputs.signal,
        )
      : { body: originalBody, error: null, wasCompressed: false };
  const inspection = await inspectPayload(
    originalBody,
    payload.body,
    resourceType,
    contentType,
    inputs.config,
  );
  const resourceId = makeId("res", `${inputs.request.id}:${finalUrl}`);
  return {
    resourceId,
    resource: createResource(
      inputs,
      finalUrl,
      resourceType,
      contentType,
      payload,
      inspection,
    ),
    resourceType,
    finalUrl,
    contentType,
    payloadBody: payload.body,
    payloadOwned: payload.wasCompressed,
    encoding: inspection.encoding,
    preparationError: payload.error,
  };
}
