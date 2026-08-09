import type { ResponseBody } from "@ismail-elkorchi/http-client";
import { responseBodyPrefix } from "@ismail-elkorchi/http-client";
import { decodeBody, type DecodedBody, type DecodingPolicy } from "./index.js";
import type { EncodingKind } from "./detection.js";

export async function decodeResponseBody(
  body: ResponseBody,
  contentType: string | null,
  kind: EncodingKind,
  maxBytes: number,
  policy: DecodingPolicy,
): Promise<DecodedBody> {
  const bytes = await responseBodyPrefix(body, maxBytes);
  return decodeBody(bytes, contentType, kind, policy);
}
