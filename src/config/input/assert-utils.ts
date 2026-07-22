export type UnknownRecord = Readonly<Record<string, unknown>>;

export function assertRecord(
  value: unknown,
  name: string,
): asserts value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

export function assertKnownKeys(
  value: UnknownRecord,
  keys: readonly string[],
  name: string,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new TypeError(`${name} contains unknown field "${key}".`);
    }
  }
}

export function optional(
  value: UnknownRecord,
  key: string,
  validate: (field: unknown, name: string) => void,
  name: string,
): void {
  const field = value[key];
  if (field !== undefined) validate(field, `${name}.${key}`);
}

export function assertString(value: unknown, name: string): void {
  if (typeof value !== "string")
    throw new TypeError(`${name} must be a string.`);
}

export function assertBoolean(value: unknown, name: string): void {
  if (typeof value !== "boolean")
    throw new TypeError(`${name} must be boolean.`);
}

export function assertFiniteNumber(value: unknown, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

export function assertInteger(value: unknown, name: string): void {
  assertFiniteNumber(value, name);
  if (!Number.isInteger(value))
    throw new TypeError(`${name} must be an integer.`);
}

export function assertNullableString(value: unknown, name: string): void {
  if (value !== null) assertString(value, name);
}

export function assertNullableInteger(value: unknown, name: string): void {
  if (value !== null) assertInteger(value, name);
}

export function assertStringArray(value: unknown, name: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  for (const item of value) assertString(item, `${name}[]`);
}

export function assertStringRecord(value: unknown, name: string): void {
  assertRecord(value, name);
  for (const [key, field] of Object.entries(value)) {
    assertString(field, `${name}.${key}`);
  }
}
