import type { XmlParseError } from "@ismail-elkorchi/xml-parser";
import type { ParserDiagnostic } from "../core/types.js";
export function xmlDiagnostics(
  errors: readonly XmlParseError[],
): readonly ParserDiagnostic[] {
  return errors.map((error) => ({
    level: "error",
    code: error.parseErrorId,
    message: error.message,
    position: {
      startOffset: error.offset,
      endOffset: error.offset,
      line: error.line,
      column: error.column,
    },
  }));
}
