import {
  getAttributeValue,
  getAttributeValueNS,
  HTML_NAMESPACE_URI,
  type Attribute,
  type ElementNode,
  type Span,
} from "@ismail-elkorchi/html-parser";
import type { SourcePosition } from "../../core/types.js";

export function getUnnamespacedAttribute(
  node: ElementNode | null,
  localName: string,
): string | null {
  if (node === null) return null;
  const value =
    node.namespaceUri === HTML_NAMESPACE_URI
      ? getAttributeValue(node, localName)
      : getAttributeValueNS(node, null, localName);
  return value ?? null;
}

export function getNamespacedAttribute(
  node: ElementNode,
  namespaceUri: string,
  localName: string,
): string | null {
  return getAttributeValueNS(node, namespaceUri, localName) ?? null;
}

export function elementAttributes(
  node: ElementNode,
): Readonly<Record<string, string>> {
  const record: Record<string, string> = {};
  for (const attribute of node.attributes) {
    record[qualifiedAttributeName(node, attribute)] = attribute.value;
  }
  return record;
}

export function relValues(node: ElementNode): readonly string[] {
  return (getUnnamespacedAttribute(node, "rel") ?? "")
    .split(/\s+/u)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

function qualifiedAttributeName(
  node: ElementNode,
  attribute: Attribute,
): string {
  const localName =
    node.namespaceUri === HTML_NAMESPACE_URI && attribute.namespaceUri === null
      ? attribute.localName.toLowerCase()
      : attribute.localName;
  return attribute.prefix === undefined
    ? localName
    : `${attribute.prefix}:${localName}`;
}

export function spanToPosition(span: Span | null): SourcePosition | null {
  if (span === null) return null;
  return {
    startOffset: span.start,
    endOffset: span.end,
    line: null,
    column: null,
  };
}
