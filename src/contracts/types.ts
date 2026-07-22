export type JsonSchemaPrimitive = string | number | boolean | null;

export type JsonSchemaTypeName =
  "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface JsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly type?: JsonSchemaTypeName | readonly JsonSchemaTypeName[];
  readonly const?: JsonSchemaPrimitive;
  readonly enum?: readonly JsonSchemaPrimitive[];
  readonly pattern?: string;
  readonly minimum?: number;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly items?: JsonSchema;
  readonly oneOf?: readonly JsonSchema[];
}

export interface RuntimeContract {
  readonly name: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly schema: JsonSchema;
  is(value: unknown): boolean;
  parse(value: unknown): unknown;
}

export interface ContractIssue {
  readonly contract: string;
  readonly message: string;
}
