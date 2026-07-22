export type RunStatus =
  "completed" | "partial" | "stopped_by_limit" | "aborted" | "failed";
export type StopReason =
  "frontier_empty" | "limit_reached" | "aborted" | "fatal_error";
export interface SourcePosition {
  readonly startOffset: number | null;
  readonly endOffset: number | null;
  readonly line: number | null;
  readonly column: number | null;
}
export interface ParserDiagnostic {
  readonly level: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly position: SourcePosition | null;
}
export interface ParserBudgetLimits {
  readonly maxInputBytes: number | null;
  readonly maxNodes: number | null;
  readonly maxDepth: number | null;
  readonly maxTextBytes: number | null;
}

export type ParserBudgetName =
  | "maxInputBytes"
  | "maxStreamBytes"
  | "maxNodes"
  | "maxDepth"
  | "maxTextBytes"
  | "maxAttributesPerElement"
  | "maxErrors"
  | "maxTimeMs"
  | "maxSteps";

export type ParserBudgetReport = ParserBudgetLimits &
  (
    | { readonly status: "within-limits" }
    | {
        readonly status: "exceeded";
        readonly budget: ParserBudgetName;
        readonly limit: number;
        readonly actual: number;
      }
  );
