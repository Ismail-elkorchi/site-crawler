export interface EncodingFact {
  readonly encoding: string;
  readonly source:
    | "bom"
    | "http-header"
    | "html-meta"
    | "xml-declaration"
    | "xml-signature"
    | "fallback"
    | "unknown";
  readonly hadReplacementChars: boolean;
}
