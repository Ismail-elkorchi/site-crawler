import { createHash } from "node:crypto";
export type Result<T, E> = Ok<T> | Err<E>;
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
export function nowIso(): string {
  return new Date().toISOString();
}
export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
export function makeId(prefix: string, input: string): string {
  return `${prefix}_${sha256(input).slice(0, 24)}`;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
export function truncateUtf16(
  input: string,
  maxChars: number,
): {
  readonly text: string;
  readonly truncated: boolean;
} {
  if (input.length <= maxChars) return { text: input, truncated: false };
  return { text: input.slice(0, maxChars), truncated: true };
}
export function globishToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
export function safeJsonParse(text: string): Result<unknown, string> {
  try {
    return ok(JSON.parse(text));
  } catch (caught) {
    return err(errorMessage(caught));
  }
}
