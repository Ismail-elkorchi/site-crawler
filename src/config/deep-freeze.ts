export function deepFreeze<T>(value: T): T {
  if (!isObject(value) || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor)
      deepFreeze(descriptor.value);
  }
  Object.freeze(value);
  return value;
}
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
