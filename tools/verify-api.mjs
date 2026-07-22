import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const surface = JSON.parse(
  await fs.readFile(path.join(root, "api-surface.json"), "utf8"),
);
assert.equal(surface.version, packageJson.version);
for (const [subpath, expected] of Object.entries(surface.stable)) {
  const exportValue = packageJson.exports[subpath];
  assert.notEqual(exportValue, undefined, `Missing package export ${subpath}`);
  const importPath =
    typeof exportValue === "string" ? exportValue : exportValue.import;
  assert.equal(typeof importPath, "string");
  const module = await import(
    pathToFileURL(path.resolve(root, importPath)).href
  );
  for (const name of expected)
    assert.equal(name in module, true, `${subpath} is missing ${name}`);
}
for (const subpath of Object.keys(surface.experimental)) {
  assert.notEqual(
    packageJson.exports[subpath],
    undefined,
    `Missing experimental export ${subpath}`,
  );
}
console.log(
  `Verified ${Object.keys(surface.stable).length} stable package subpaths.`,
);
