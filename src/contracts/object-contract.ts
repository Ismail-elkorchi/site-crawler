import type { JsonSchema, RuntimeContract } from "./types.js";

export interface ObjectContractOptions {
  readonly name: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly requiredStringFields: readonly string[];
  readonly requiredNumberFields?: readonly string[];
  readonly requiredBooleanFields?: readonly string[];
  readonly requiredObjectFields?: readonly string[];
  readonly requiredArrayFields?: readonly string[];
  readonly requiredNullableStringFields?: readonly string[];
  readonly requiredNullableNumberFields?: readonly string[];
  readonly requiredNullableObjectFields?: readonly string[];
  readonly requiredUnknownFields?: readonly string[];
  readonly optionalStringFields?: readonly string[];
  readonly optionalNullableStringFields?: readonly string[];
  readonly optionalObjectFields?: readonly string[];
  readonly allowAdditionalProperties?: boolean;
  readonly allowedFields?: readonly string[];
}

export function objectContract(
  options: ObjectContractOptions,
): RuntimeContract {
  const schema = makeSchema(options);
  return {
    name: options.name,
    schemaId: options.schemaId,
    schemaVersion: options.schemaVersion,
    schema,
    is: (value) => isObjectContract(value, options),
    parse(value) {
      if (!isObjectContract(value, options)) {
        throw new TypeError(
          `${options.name} does not satisfy ${options.schemaId} version ${options.schemaVersion}.`,
        );
      }
      return value;
    },
  };
}

function isObjectContract(
  value: unknown,
  options: ObjectContractOptions,
): boolean {
  if (!isRecord(value)) return false;
  if (value["schemaId"] !== options.schemaId) return false;
  if (value["schemaVersion"] !== options.schemaVersion) return false;
  if (!fieldsHaveType(value, options.requiredStringFields, "string")) {
    return false;
  }
  if (!fieldsHaveType(value, options.requiredNumberFields ?? [], "number")) {
    return false;
  }
  if (!fieldsHaveType(value, options.requiredBooleanFields ?? [], "boolean")) {
    return false;
  }
  for (const key of options.requiredObjectFields ?? []) {
    if (!isRecord(value[key])) return false;
  }
  for (const key of options.requiredArrayFields ?? []) {
    if (!Array.isArray(value[key])) return false;
  }
  if (
    !fieldsHaveNullableType(
      value,
      options.requiredNullableStringFields ?? [],
      "string",
    )
  ) {
    return false;
  }
  if (
    !fieldsHaveNullableType(
      value,
      options.requiredNullableNumberFields ?? [],
      "number",
    )
  ) {
    return false;
  }
  for (const key of options.requiredNullableObjectFields ?? []) {
    const field = value[key];
    if (field !== null && !isRecord(field)) return false;
  }
  for (const key of options.requiredUnknownFields ?? []) {
    if (!Object.hasOwn(value, key)) return false;
  }
  if (
    !optionalFieldsHaveType(value, options.optionalStringFields ?? [], "string")
  ) {
    return false;
  }
  if (
    !optionalFieldsHaveNullableType(
      value,
      options.optionalNullableStringFields ?? [],
      "string",
    )
  ) {
    return false;
  }
  for (const key of options.optionalObjectFields ?? []) {
    if (Object.hasOwn(value, key) && !isRecord(value[key])) return false;
  }
  if (options.allowedFields !== undefined) {
    const allowed = new Set([
      "schemaId",
      "schemaId",
      "schemaVersion",
      ...options.allowedFields,
    ]);
    if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  }
  return true;
}

function optionalFieldsHaveType(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  expected: "string",
): boolean {
  return fields.every(
    (field) => !Object.hasOwn(value, field) || typeof value[field] === expected,
  );
}

function optionalFieldsHaveNullableType(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  expected: "string",
): boolean {
  return fields.every((field) => {
    if (!Object.hasOwn(value, field)) return true;
    const item = value[field];
    return item === null || typeof item === expected;
  });
}

function fieldsHaveType(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  expected: "string" | "number" | "boolean",
): boolean {
  return fields.every((field) => {
    const item = value[field];
    if (typeof item !== expected) return false;
    return expected !== "number" || Number.isFinite(item);
  });
}

function fieldsHaveNullableType(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  expected: "string" | "number",
): boolean {
  return fields.every((field) => {
    if (!Object.hasOwn(value, field)) return false;
    const item = value[field];
    if (item === null) return true;
    if (typeof item !== expected) return false;
    return expected !== "number" || Number.isFinite(item);
  });
}

function makeSchema(options: ObjectContractOptions): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    schemaId: { const: options.schemaId },
    schemaVersion: { const: options.schemaVersion },
  };
  for (const field of options.requiredStringFields) {
    properties[field] = { type: "string" };
  }
  for (const field of options.requiredNumberFields ?? []) {
    properties[field] = { type: "number" };
  }
  for (const field of options.requiredBooleanFields ?? []) {
    properties[field] = { type: "boolean" };
  }
  for (const field of options.requiredObjectFields ?? []) {
    properties[field] = { type: "object" };
  }
  for (const field of options.requiredArrayFields ?? []) {
    properties[field] = { type: "array" };
  }
  for (const field of options.requiredNullableStringFields ?? []) {
    properties[field] = { type: ["string", "null"] };
  }
  for (const field of options.requiredNullableNumberFields ?? []) {
    properties[field] = { type: ["number", "null"] };
  }
  for (const field of options.requiredNullableObjectFields ?? []) {
    properties[field] = { type: ["object", "null"] };
  }
  for (const field of options.requiredUnknownFields ?? []) {
    properties[field] = {};
  }
  for (const field of options.optionalStringFields ?? []) {
    properties[field] = { type: "string" };
  }
  for (const field of options.optionalNullableStringFields ?? []) {
    properties[field] = { type: ["string", "null"] };
  }
  for (const field of options.optionalObjectFields ?? []) {
    properties[field] = { type: "object" };
  }
  for (const field of options.allowedFields ?? []) {
    if (properties[field] === undefined) properties[field] = {};
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: options.name,
    type: "object",
    required: [
      "schemaId",
      "schemaVersion",
      ...options.requiredStringFields,
      ...(options.requiredNumberFields ?? []),
      ...(options.requiredBooleanFields ?? []),
      ...(options.requiredObjectFields ?? []),
      ...(options.requiredArrayFields ?? []),
      ...(options.requiredNullableStringFields ?? []),
      ...(options.requiredNullableNumberFields ?? []),
      ...(options.requiredNullableObjectFields ?? []),
      ...(options.requiredUnknownFields ?? []),
    ],
    properties,
    additionalProperties:
      options.allowedFields === undefined
        ? (options.allowAdditionalProperties ?? true)
        : false,
  };
}

export function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) =>
      descriptor.get === undefined && descriptor.set === undefined,
  );
}
