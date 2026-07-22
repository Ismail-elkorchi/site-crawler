export function assertPlainData(value: unknown, rootPath = "config"): void {
  const seen = new WeakSet<object>();
  visit(value, rootPath, seen);
}
function visit(value: unknown, path: string, seen: WeakSet<object>): void {
  if (value === null) return;
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return;
    case "undefined":
      throw new TypeError(`${path} contains an explicit undefined value.`);
    case "function":
    case "symbol":
    case "bigint":
      throw new TypeError(
        `${path} contains a non-data value of type ${typeof value}.`,
      );
    case "object":
      visitObject(value, path, seen);
      return;
  }
}
function visitObject(value: object, path: string, seen: WeakSet<object>): void {
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle.`);
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw new TypeError(`${path} must contain only plain objects and arrays.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string")
      throw new TypeError(`${path} contains a symbol-keyed property.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new TypeError(`${path}.${key} contains an accessor property.`);
    }
    if ("value" in descriptor) visit(descriptor.value, `${path}.${key}`, seen);
  }
  seen.delete(value);
}
