import type { JsonSchema, RuntimeContract } from "./types.js";

export interface PredicateContractOptions {
  readonly name: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly schema: JsonSchema;
  is(value: unknown): boolean;
  parse(value: unknown): unknown;
}

export function predicateContract(
  options: PredicateContractOptions,
): RuntimeContract {
  return {
    name: options.name,
    schemaId: options.schemaId,
    schemaVersion: options.schemaVersion,
    schema: options.schema,
    is: options.is,
    parse: options.parse,
  };
}
