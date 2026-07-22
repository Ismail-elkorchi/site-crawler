import type {
  XmlAttribute,
  XmlElementNode,
  XmlNode,
} from "@ismail-elkorchi/xml-parser";
import type { XmlNamespaceFact } from "./types.js";
export function elementChildren(
  node: XmlElementNode,
  localName: string,
  namespaceURI: string | null,
): readonly XmlElementNode[] {
  return node.children.filter(
    (child): child is XmlElementNode =>
      child.kind === "element" &&
      child.localName === localName &&
      child.namespaceURI === namespaceURI,
  );
}
export function childText(
  node: XmlElementNode,
  localName: string,
  namespaceURI: string | null,
): string | null {
  const child = elementChildren(node, localName, namespaceURI)[0];
  if (child === undefined) return null;
  const text = collectText(child).trim();
  return text.length === 0 ? null : text;
}
export function collectText(node: XmlNode): string {
  if (node.kind === "text") return node.value;
  return node.children.map(collectText).join("");
}
export function attr(
  node: XmlElementNode,
  localName: string,
  namespaceURI: string | null,
): string | null {
  return (
    node.attributes.find(
      (attribute) =>
        attribute.localName === localName &&
        attribute.namespaceURI === namespaceURI,
    )?.value ?? null
  );
}
export function namespaces(root: XmlElementNode): readonly XmlNamespaceFact[] {
  return root.attributes.filter(isNamespaceAttribute).map((attribute) => ({
    prefix: namespacePrefix(attribute),
    uri: attribute.value,
  }));
}
function isNamespaceAttribute(attribute: XmlAttribute): boolean {
  return attribute.qName === "xmlns" || attribute.qName.startsWith("xmlns:");
}
function namespacePrefix(attribute: XmlAttribute): string | null {
  if (attribute.qName === "xmlns") return null;
  return attribute.qName.slice("xmlns:".length);
}
