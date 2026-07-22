import { parse } from "acorn";
import type { JavascriptDiscoveryMethod } from "../discovery/types.js";
import { JavascriptCandidateSet, literalMethod } from "./candidates.js";

export function discoverJavascriptAst(
  script: string,
  candidates: JavascriptCandidateSet,
): void {
  const root = parseProgram(script);
  if (root === null) return;
  visit(root, candidates, collectXhrIdentifiers(root));
}

function parseProgram(script: string): unknown | null {
  try {
    return parse(script, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowHashBang: true,
    });
  } catch {
    try {
      return parse(script, {
        ecmaVersion: "latest",
        sourceType: "script",
        allowHashBang: true,
      });
    } catch {
      return null;
    }
  }
}

function visit(
  value: unknown,
  candidates: JavascriptCandidateSet,
  xhrIdentifiers: ReadonlySet<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, candidates, xhrIdentifiers);
    return;
  }
  if (!isRecord(value)) return;
  inspectNode(value, candidates, xhrIdentifiers);
  for (const [key, child] of Object.entries(value)) {
    if (key === "start" || key === "end" || key === "loc") continue;
    if (Array.isArray(child) || isRecord(child))
      visit(child, candidates, xhrIdentifiers);
  }
}

function inspectNode(
  node: Readonly<Record<string, unknown>>,
  candidates: JavascriptCandidateSet,
  xhrIdentifiers: ReadonlySet<string>,
): void {
  const type = stringProperty(node, "type");
  const offset = numberProperty(node, "start");
  if (type === "Literal" || type === "TemplateLiteral") {
    const value = staticString(node);
    const method = value === null ? null : literalMethod(value);
    if (value !== null && method !== null)
      candidates.add(value, method, "medium", offset);
  }
  if (type === "ImportExpression")
    addArgument(node["source"], "dynamic-import", offset, candidates);
  if (type === "CallExpression")
    inspectCall(node, offset, candidates, xhrIdentifiers);
  if (type === "NewExpression") inspectNew(node, offset, candidates);
}

function inspectCall(
  node: Readonly<Record<string, unknown>>,
  offset: number | null,
  candidates: JavascriptCandidateSet,
  xhrIdentifiers: ReadonlySet<string>,
): void {
  const callee = node["callee"];
  const args = arrayProperty(node, "arguments");
  if (identifierName(callee) === "fetch")
    addArgument(args[0], "fetch-call", offset, candidates);
  if (
    memberName(callee) === "open" &&
    isRecord(callee) &&
    isXhrExpression(callee["object"], xhrIdentifiers) &&
    isHttpMethod(staticString(args[0]))
  )
    addArgument(args[1], "xhr-open", offset, candidates);
}

function collectXhrIdentifiers(root: unknown): ReadonlySet<string> {
  const candidates = new Set<string>();
  const conflicts = new Set<string>();
  walk(root, (node) => {
    const type = stringProperty(node, "type");
    if (type === "VariableDeclarator") {
      const name = identifierName(node["id"]);
      if (name !== null) {
        if (isXhrConstructor(node["init"])) candidates.add(name);
        else conflicts.add(name);
      }
    }
    if (type === "AssignmentExpression") {
      const name = identifierName(node["left"]);
      if (name !== null) {
        if (isXhrConstructor(node["right"])) candidates.add(name);
        else conflicts.add(name);
      }
    }
    if (isFunctionNode(type)) {
      for (const parameter of arrayProperty(node, "params")) {
        const name = identifierName(parameter);
        if (name !== null) conflicts.add(name);
      }
    }
  });
  return new Set([...candidates].filter((name) => !conflicts.has(name)));
}

function walk(
  value: unknown,
  visitor: (node: Readonly<Record<string, unknown>>) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
    return;
  }
  if (!isRecord(value)) return;
  visitor(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "start" || key === "end" || key === "loc") continue;
    if (Array.isArray(child) || isRecord(child)) walk(child, visitor);
  }
}

function isXhrExpression(
  value: unknown,
  identifiers: ReadonlySet<string>,
): boolean {
  if (isXhrConstructor(value)) return true;
  const name = identifierName(value);
  return name !== null && identifiers.has(name);
}

function isXhrConstructor(value: unknown): boolean {
  return (
    isRecord(value) &&
    stringProperty(value, "type") === "NewExpression" &&
    identifierName(value["callee"]) === "XMLHttpRequest"
  );
}

function isHttpMethod(value: string | null): boolean {
  return value !== null && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(value);
}

function isFunctionNode(type: string | null): boolean {
  return (
    type === "FunctionDeclaration" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  );
}

function inspectNew(
  node: Readonly<Record<string, unknown>>,
  offset: number | null,
  candidates: JavascriptCandidateSet,
): void {
  if (identifierName(node["callee"]) !== "URL") return;
  addArgument(
    arrayProperty(node, "arguments")[0],
    "url-constructor",
    offset,
    candidates,
  );
}

function addArgument(
  value: unknown,
  method: JavascriptDiscoveryMethod,
  offset: number | null,
  candidates: JavascriptCandidateSet,
): void {
  const text = staticString(value);
  if (text !== null) candidates.add(text, method, "high", offset);
}

function staticString(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const type = stringProperty(value, "type");
  if (type === "Literal")
    return typeof value["value"] === "string" ? value["value"] : null;
  if (type !== "TemplateLiteral") return null;
  const expressions = arrayProperty(value, "expressions");
  const quasis = arrayProperty(value, "quasis");
  if (expressions.length !== 0 || quasis.length !== 1) return null;
  const quasi = quasis[0];
  if (!isRecord(quasi) || !isRecord(quasi["value"])) return null;
  const cooked = quasi["value"]["cooked"];
  const raw = quasi["value"]["raw"];
  if (typeof cooked === "string") return cooked;
  return typeof raw === "string" ? raw : null;
}

function identifierName(value: unknown): string | null {
  if (!isRecord(value) || stringProperty(value, "type") !== "Identifier")
    return null;
  return stringProperty(value, "name");
}

function memberName(value: unknown): string | null {
  if (!isRecord(value) || stringProperty(value, "type") !== "MemberExpression")
    return null;
  const property = value["property"];
  return identifierName(property) ?? staticString(property);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringProperty(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const item = value[key];
  return typeof item === "string" ? item : null;
}

function numberProperty(
  value: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const item = value[key];
  return typeof item === "number" ? item : null;
}

function arrayProperty(
  value: Readonly<Record<string, unknown>>,
  key: string,
): readonly unknown[] {
  const item = value[key];
  return Array.isArray(item) ? item : [];
}
