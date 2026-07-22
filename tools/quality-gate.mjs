import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const repositoryRoot = path.resolve(new URL("..", import.meta.url).pathname);
const sourceRoot = path.join(repositoryRoot, "src");
const failures = [];
const warnings = [];
const sourceFiles = await collectTypeScriptFiles(sourceRoot);
const sourceSet = new Set(sourceFiles);
const graph = new Map();

for (const filePath of sourceFiles) {
  const sourceText = await fs.readFile(filePath, "utf8");
  const relativePath = path.relative(repositoryRoot, filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  checkTextRules(relativePath, sourceText);
  checkCohesionSignals(relativePath, sourceText);
  checkSyntax(relativePath, sourceFile);
  const imports = collectInternalImports(filePath, sourceFile, sourceSet);
  graph.set(filePath, imports);
  checkDependencyDirection(relativePath, imports);
  checkPublicBoundary(relativePath, imports);
}

await checkRootLayout();
checkImportCycles(graph);
await checkReachability(graph, sourceSet);

if (warnings.length > 0) {
  console.warn("Quality observations:");
  for (const warning of [...new Set(warnings)].sort())
    console.warn(`- ${warning}`);
}
if (failures.length > 0) {
  console.error("Quality gate failed:");
  for (const failure of [...new Set(failures)].sort())
    console.error(`- ${failure}`);
  process.exitCode = 1;
}

function checkTextRules(relativePath, sourceText) {
  for (const token of ["@ts-ignore", "@ts-expect-error", "eslint-disable"]) {
    if (sourceText.includes(token)) failures.push(`${relativePath}: ${token}`);
  }
}

function checkCohesionSignals(relativePath, sourceText) {
  const lineCount = sourceText.split("\n").length;
  if (lineCount > 320)
    warnings.push(`${relativePath}: ${lineCount} lines; review cohesion`);
}

function checkSyntax(relativePath, sourceFile) {
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      failures.push(`${relativePath}: explicit any type`);
    if (ts.isTypeAssertionExpression(node))
      failures.push(`${relativePath}: angle-bracket type assertion`);
    if (ts.isAsExpression(node) && !isConstAssertion(node, sourceFile))
      failures.push(`${relativePath}: non-const type assertion`);
    if (ts.isNonNullExpression(node))
      failures.push(`${relativePath}: non-null assertion`);
    if (ts.isParameter(node) && isParameterProperty(node))
      failures.push(`${relativePath}: constructor parameter property`);
    if (ts.isConstructorDeclaration(node) && node.parameters.length > 16) {
      failures.push(
        `${relativePath}: constructor has ${node.parameters.length} dependencies`,
      );
    }
    if (isFunctionLike(node)) {
      const complexity = cyclomaticComplexity(node);
      if (complexity > 45)
        failures.push(
          `${relativePath}: function complexity ${complexity} exceeds 45`,
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function cyclomaticComplexity(node) {
  let complexity = 1;
  const visit = (child) => {
    if (child !== node && isFunctionLike(child)) return;
    if (
      ts.isIfStatement(child) ||
      ts.isForStatement(child) ||
      ts.isForInStatement(child) ||
      ts.isForOfStatement(child) ||
      ts.isWhileStatement(child) ||
      ts.isDoStatement(child) ||
      ts.isConditionalExpression(child) ||
      ts.isCatchClause(child) ||
      ts.isCaseClause(child) ||
      child.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      child.kind === ts.SyntaxKind.BarBarToken ||
      child.kind === ts.SyntaxKind.QuestionQuestionToken
    )
      complexity += 1;
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return complexity;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function isConstAssertion(node, sourceFile) {
  return node.getText(sourceFile).trimEnd().endsWith(" as const");
}

function isParameterProperty(node) {
  if (!ts.isConstructorDeclaration(node.parent)) return false;
  return (
    node.modifiers?.some((modifier) =>
      [
        ts.SyntaxKind.PublicKeyword,
        ts.SyntaxKind.PrivateKeyword,
        ts.SyntaxKind.ProtectedKeyword,
        ts.SyntaxKind.ReadonlyKeyword,
      ].includes(modifier.kind),
    ) === true
  );
}

function collectInternalImports(filePath, sourceFile, knownFiles) {
  const imports = [];
  for (const statement of sourceFile.statements) {
    if (
      (!ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)) ||
      statement.moduleSpecifier === undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    const resolved = resolveInternalModule(filePath, specifier, knownFiles);
    if (resolved !== null) imports.push(resolved);
  }
  return imports;
}

function resolveInternalModule(filePath, specifier, knownFiles) {
  const base = path.resolve(path.dirname(filePath), specifier);
  const candidates = specifier.endsWith(".js")
    ? [base.slice(0, -3) + ".ts"]
    : [base + ".ts", path.join(base, "index.ts")];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function checkDependencyDirection(relativePath, imports) {
  const sourceArea = areaOf(relativePath);
  for (const importedPath of imports) {
    const targetRelative = path.relative(repositoryRoot, importedPath);
    const targetArea = areaOf(targetRelative);
    if (sourceArea === "core" && targetArea !== "core")
      failures.push(`${relativePath}: core may not depend on ${targetArea}`);
    if (
      sourceArea === "http" &&
      ["crawler", "frontier", "storage", "html", "xml"].includes(targetArea)
    )
      failures.push(`${relativePath}: http may not depend on ${targetArea}`);
    if (
      sourceArea === "frontier" &&
      ["crawler", "storage", "html", "xml", "resources"].includes(targetArea)
    )
      failures.push(
        `${relativePath}: frontier may not depend on ${targetArea}`,
      );
    if (
      relativePath.startsWith("src/html/facts/") &&
      ["crawler", "frontier", "storage", "resources"].includes(targetArea)
    )
      failures.push(
        `${relativePath}: HTML facts may not depend on ${targetArea}`,
      );
    if (
      ["encoding", "network", "url"].includes(sourceArea) &&
      ["crawler", "frontier", "storage"].includes(targetArea)
    )
      failures.push(
        `${relativePath}: ${sourceArea} may not depend on ${targetArea}`,
      );
    if (
      sourceArea === "storage" &&
      ["crawler", "rendering"].includes(targetArea)
    )
      failures.push(`${relativePath}: storage may not depend on ${targetArea}`);
  }
}

function checkPublicBoundary(relativePath, imports) {
  if (relativePath === "src/index.ts") return;
  for (const importedPath of imports) {
    const targetRelative = path.relative(repositoryRoot, importedPath);
    if (targetRelative === "src/index.ts")
      failures.push(
        `${relativePath}: internal code may not import the package root`,
      );
  }
}

function areaOf(relativePath) {
  return relativePath.split(path.sep)[1] ?? "unknown";
}

async function checkRootLayout() {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name !== "index.ts")
      failures.push(
        `src/${entry.name}: root source files are not allowed outside src/index.ts`,
      );
  }
}

function checkImportCycles(importGraph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (filePath) => {
    if (visiting.has(filePath)) {
      const cycleStart = stack.indexOf(filePath);
      const cycle = [...stack.slice(cycleStart), filePath]
        .map((item) => path.relative(repositoryRoot, item))
        .join(" -> ");
      failures.push(`import cycle: ${cycle}`);
      return;
    }
    if (visited.has(filePath)) return;
    visiting.add(filePath);
    stack.push(filePath);
    for (const dependency of importGraph.get(filePath) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(filePath);
    visited.add(filePath);
  };
  for (const filePath of importGraph.keys()) visit(filePath);
}

async function checkReachability(importGraph, knownFiles) {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const entries = [path.join(sourceRoot, "cli", "index.ts")];
  for (const value of Object.values(packageJson.exports)) {
    if (typeof value !== "object" || value === null) continue;
    const importPath = value.import;
    if (typeof importPath !== "string" || !importPath.startsWith("./dist/"))
      continue;
    entries.push(
      path.join(
        sourceRoot,
        importPath.slice("./dist/".length).replace(/\.js$/, ".ts"),
      ),
    );
  }
  const reachable = new Set();
  const visit = (filePath) => {
    if (reachable.has(filePath) || !knownFiles.has(filePath)) return;
    reachable.add(filePath);
    for (const dependency of importGraph.get(filePath) ?? []) visit(dependency);
  };
  for (const entry of entries) visit(entry);
  for (const filePath of knownFiles) {
    if (!reachable.has(filePath)) {
      failures.push(
        `${path.relative(repositoryRoot, filePath)}: unreachable from package or CLI entry points`,
      );
    }
  }
}

async function collectTypeScriptFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await collectTypeScriptFiles(child)));
    else if (entry.isFile() && child.endsWith(".ts")) files.push(child);
  }
  return files.sort();
}
