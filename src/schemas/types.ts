export interface SchemaValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type SchemaValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly SchemaValidationIssue[] };

export interface JsonSchemaDocument extends JsonSchema {
  readonly $schema: "https://json-schema.org/draft/2020-12/schema";
  readonly $id: string;
  readonly title: string;
  readonly type: "object";
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly additionalProperties: boolean;
}

export interface JsonSchemaProperty extends JsonSchema {}

export type { JsonSchemaPrimitive, JsonSchemaTypeName };

export interface PersistentSchemaDescriptor {
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly title: string;
  readonly required: readonly string[];
  readonly jsonSchema: JsonSchemaDocument;
  validate(value: unknown): SchemaValidationResult;
}
import type {
  JsonSchema,
  JsonSchemaPrimitive,
  JsonSchemaTypeName,
} from "../contracts/types.js";
