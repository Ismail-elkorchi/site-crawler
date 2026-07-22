export {
  getNamespacedAttribute,
  getUnnamespacedAttribute,
  relValues,
  spanToPosition,
} from "./attributes.js";
export {
  firstElement,
  formFact,
  headingFacts,
  iframeFact,
  imageFact,
  jsonLdFact,
  microdataFact,
  scriptFact,
} from "./elements.js";
export {
  anchorFact,
  firstLinkFact,
  firstValidBaseHref,
  hreflangFact,
  linkFact,
} from "./links.js";
export {
  findMetaRefresh,
  firstMetaContent,
  metaFact,
  textFactFromNode,
} from "./metadata.js";
export { parseSrcset } from "./srcset.js";
export { parseXRobotsTag } from "./robots.js";
