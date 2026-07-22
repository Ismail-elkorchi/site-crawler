import { contractForSchema, runtimeContracts } from "../contracts/catalog.js";
import type { JsonSchema } from "../contracts/types.js";
import type {
  JsonSchemaDocument,
  PersistentSchemaDescriptor,
  SchemaValidationResult,
} from "./types.js";

export const persistentSchemas: readonly PersistentSchemaDescriptor[] =
  runtimeContracts.map((contract) => ({
    schemaId: contract.schemaId,
    schemaVersion: contract.schemaVersion,
    title: contract.name,
    required: requiredFields(contract.schema),
    jsonSchema: document(
      contract.name,
      contract.schemaId,
      contract.schemaVersion,
      contract.schema,
    ),
    validate(value): SchemaValidationResult {
      return contract.is(value)
        ? { ok: true }
        : {
            ok: false,
            issues: [
              {
                path: "$",
                message: `Value does not satisfy ${contract.name} (${contract.schemaId} version ${contract.schemaVersion}).`,
              },
            ],
          };
    },
  }));

export function schemaForId(
  schemaId: string,
): PersistentSchemaDescriptor | null {
  return (
    persistentSchemas.find((schema) => schema.schemaId === schemaId) ?? null
  );
}

export function validatePersistentValue(
  value: unknown,
): SchemaValidationResult {
  if (
    !isRecord(value) ||
    typeof value["schemaId"] !== "string" ||
    typeof value["schemaVersion"] !== "number"
  ) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          message:
            "schemaId must be a string and schemaVersion must be a number.",
        },
      ],
    };
  }
  const contract = contractForSchema(value["schemaId"]);
  if (contract === null) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          message: `Unsupported schema: ${value["schemaId"]} version ${value["schemaVersion"]}.`,
        },
      ],
    };
  }
  return contract.is(value)
    ? { ok: true }
    : {
        ok: false,
        issues: [
          {
            path: "$",
            message: `Value does not satisfy ${contract.name}.`,
          },
        ],
      };
}

function requiredFields(schema: JsonSchema): readonly string[] {
  return schema.required ?? [];
}

function document(
  title: string,
  schemaId: string,
  schemaVersion: number,
  schema: JsonSchema,
): JsonSchemaDocument {
  return {
    ...schema,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://schemas.site-crawler.dev/${schemaId}.v${schemaVersion}.json`,
    title,
    type: "object",
    required: requiredFields(schema),
    properties: schema.properties ?? {},
    additionalProperties: schema["additionalProperties"] !== false,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
