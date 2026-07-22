export function record(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${name} must be a plain object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new Error(`${name}.${key} must be a data property.`);
    }
    if (descriptor.enumerable === true) output[key] = descriptor.value;
  }
  return output;
}

export function exactRecord(
  value: unknown,
  name: string,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  const input = record(value, name);
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `${name} contains unknown fields: ${unknownKeys.join(", ")}.`,
    );
  }
  return input;
}

export function stringField(
  input: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string.`);
  return value;
}

export function nullableString(
  input: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = input[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string or null.`);
  }
  return value;
}

export function numberField(
  input: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return value;
}

export function integerField(
  input: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = numberField(input, key);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer.`);
  return value;
}

export function nullableNumber(
  input: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const value = input[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number or null.`);
  }
  return value;
}

export function nullableIntegerField(
  input: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const value = nullableNumber(input, key);
  if (value !== null && !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer or null.`);
  }
  return value;
}

export function booleanField(
  input: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const value = input[key];
  if (typeof value !== "boolean") throw new Error(`${key} must be boolean.`);
  return value;
}

export function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings.`);
  }
  return value.map((item) => String(item));
}
