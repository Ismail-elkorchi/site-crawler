export interface HtmlParsingConfig {
  readonly maxInputBytes: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxTextBytes: number;
}
