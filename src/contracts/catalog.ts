import { persistentObjectDefinitions } from "./definitions/persistent.js";
import { predicateContracts } from "./definitions/predicates.js";
import { objectContract } from "./object-contract.js";
import { isRecord } from "./object-contract.js";
import type { RuntimeContract } from "./types.js";

const objectContracts = persistentObjectDefinitions.map((definition) =>
  objectContract(definition),
);

export const runtimeContracts: readonly RuntimeContract[] = [
  ...predicateContracts,
  ...objectContracts,
];

const byName = uniqueIndex(runtimeContracts, (contract) => contract.name);
const bySchemaId = uniqueIndex(
  runtimeContracts,
  (contract) => contract.schemaId,
);

export function contractForName(name: string): RuntimeContract | null {
  return byName.get(name) ?? null;
}

export function contractForSchema(schemaId: string): RuntimeContract | null {
  return bySchemaId.get(schemaId) ?? null;
}

export function validateContract(name: string, value: unknown): unknown {
  const contract = contractForName(name);
  if (contract === null) throw new Error(`Unknown runtime contract: ${name}.`);
  return contract.parse(value);
}

export function validatePersistedRecord(value: unknown): unknown {
  if (!isSchemaRecord(value)) {
    throw new TypeError(
      "Persisted records must contain a schemaId string and a positive integer schemaVersion.",
    );
  }
  const contract = contractForSchema(value.schemaId);
  if (contract === null) {
    throw new TypeError(
      `Unsupported persisted schema: ${value.schemaId} version ${value.schemaVersion}.`,
    );
  }
  return contract.parse(value);
}

function isSchemaRecord(value: unknown): value is Readonly<
  Record<string, unknown>
> & {
  readonly schemaId: string;
  readonly schemaVersion: number;
} {
  return (
    isRecord(value) &&
    Object.hasOwn(value, "schemaId") &&
    typeof value["schemaId"] === "string" &&
    Object.hasOwn(value, "schemaVersion") &&
    typeof value["schemaVersion"] === "number" &&
    isSchemaVersion(value["schemaVersion"])
  );
}

function isSchemaVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function uniqueIndex(
  contracts: readonly RuntimeContract[],
  keyFor: (contract: RuntimeContract) => string,
): ReadonlyMap<string, RuntimeContract> {
  const index = new Map<string, RuntimeContract>();
  for (const contract of contracts) {
    const key = keyFor(contract);
    if (index.has(key)) throw new Error(`Duplicate runtime contract: ${key}`);
    index.set(key, contract);
  }
  return index;
}
