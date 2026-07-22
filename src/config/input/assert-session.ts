import {
  assertBoolean,
  assertInteger,
  assertKnownKeys,
  assertNullableString,
  assertRecord,
  assertString,
  optional,
} from "./assert-utils.js";

export function assertSession(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "enabled",
      "persistCookies",
      "cookieFile",
      "initialCookies",
      "basicAuth",
      "bearerAuth",
    ],
    name,
  );
  optional(value, "enabled", assertBoolean, name);
  optional(value, "persistCookies", assertBoolean, name);
  optional(value, "cookieFile", assertNullableString, name);
  optional(value, "initialCookies", assertInitialCookies, name);
  optional(value, "basicAuth", assertBasicAuth, name);
  optional(value, "bearerAuth", assertBearerAuth, name);
}

export function assertHttpCache(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    ["enabled", "directory", "storeBodies", "maxBodyBytes", "useStaleOnError"],
    name,
  );
  optional(value, "enabled", assertBoolean, name);
  optional(value, "directory", assertString, name);
  optional(value, "storeBodies", assertBoolean, name);
  optional(value, "maxBodyBytes", assertInteger, name);
  optional(value, "useStaleOnError", assertBoolean, name);
}

function assertInitialCookies(value: unknown, name: string): void {
  assertArray(value, name);
  for (const entry of value) {
    assertRecord(entry, `${name}[]`);
    assertKnownKeys(entry, ["url", "cookie"], `${name}[]`);
    assertString(entry["url"], `${name}[].url`);
    assertString(entry["cookie"], `${name}[].cookie`);
  }
}

function assertBasicAuth(value: unknown, name: string): void {
  assertArray(value, name);
  for (const entry of value) {
    assertRecord(entry, `${name}[]`);
    assertKnownKeys(entry, ["origin", "username", "password"], `${name}[]`);
    assertString(entry["origin"], `${name}[].origin`);
    assertString(entry["username"], `${name}[].username`);
    assertString(entry["password"], `${name}[].password`);
  }
}

function assertBearerAuth(value: unknown, name: string): void {
  assertArray(value, name);
  for (const entry of value) {
    assertRecord(entry, `${name}[]`);
    assertKnownKeys(entry, ["origin", "token"], `${name}[]`);
    assertString(entry["origin"], `${name}[].origin`);
    assertString(entry["token"], `${name}[].token`);
  }
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
}
