import type { ObjectContractOptions } from "../../object-contract.js";
import { SITE_CRAWLER_SCHEMA_VERSION } from "../../schema-identity.js";

export interface DefinitionFields {
  readonly strings?: readonly string[];
  readonly numbers?: readonly string[];
  readonly booleans?: readonly string[];
  readonly objects?: readonly string[];
  readonly arrays?: readonly string[];
  readonly nullableStrings?: readonly string[];
  readonly nullableNumbers?: readonly string[];
  readonly nullableObjects?: readonly string[];
  readonly unknowns?: readonly string[];
  readonly optionalStrings?: readonly string[];
  readonly optionalNullableStrings?: readonly string[];
  readonly optionalObjects?: readonly string[];
  readonly exact?: boolean;
}

export function definition(
  name: string,
  schemaId: string,
  fields: DefinitionFields,
): ObjectContractOptions {
  const exactFields = [
    ...(fields.strings ?? []),
    ...(fields.numbers ?? []),
    ...(fields.booleans ?? []),
    ...(fields.objects ?? []),
    ...(fields.arrays ?? []),
    ...(fields.nullableStrings ?? []),
    ...(fields.nullableNumbers ?? []),
    ...(fields.nullableObjects ?? []),
    ...(fields.unknowns ?? []),
    ...(fields.optionalStrings ?? []),
    ...(fields.optionalNullableStrings ?? []),
    ...(fields.optionalObjects ?? []),
  ];
  return {
    name,
    schemaId,
    schemaVersion: SITE_CRAWLER_SCHEMA_VERSION,
    requiredStringFields: fields.strings ?? [],
    requiredNumberFields: fields.numbers ?? [],
    requiredBooleanFields: fields.booleans ?? [],
    requiredObjectFields: fields.objects ?? [],
    requiredArrayFields: fields.arrays ?? [],
    requiredNullableStringFields: fields.nullableStrings ?? [],
    requiredNullableNumberFields: fields.nullableNumbers ?? [],
    requiredNullableObjectFields: fields.nullableObjects ?? [],
    requiredUnknownFields: fields.unknowns ?? [],
    optionalStringFields: fields.optionalStrings ?? [],
    optionalNullableStringFields: fields.optionalNullableStrings ?? [],
    optionalObjectFields: fields.optionalObjects ?? [],
    ...(fields.exact === false ? {} : { allowedFields: exactFields }),
  };
}
