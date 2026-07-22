import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const surfacePath = path.join(root, "api-surface.json");
const surface = JSON.parse(await fs.readFile(surfacePath, "utf8"));
assert.equal(surface.schemaId, "site-crawler.apiSurface");
assert.equal(surface.schemaVersion, 1);
assert.equal(surface.version, packageJson.version);
const classified = new Set([
  ...Object.keys(surface.stable),
  ...Object.keys(surface.experimental),
]);
for (const subpath of Object.keys(packageJson.exports)) {
  assert.ok(
    classified.has(subpath),
    `Package export is not classified: ${subpath}`,
  );
}
for (const subpath of classified) {
  const target = packageJson.exports[subpath];
  assert.ok(target, `API surface references an unknown export: ${subpath}`);
  const module = await import(
    pathToFileURL(path.join(root, target.import)).href
  );
  const actual = Object.keys(module).sort();
  const expected = [
    ...(surface.stable[subpath] ?? surface.experimental[subpath] ?? []),
  ].sort();
  assert.deepEqual(actual, expected, `Runtime API changed for ${subpath}`);
}
const declarationHashes = {};
for (const [subpath, target] of Object.entries(packageJson.exports)) {
  const bytes = await fs.readFile(path.join(root, target.types));
  declarationHashes[subpath] = createHash("sha256").update(bytes).digest("hex");
}
const snapshot = {
  schemaId: "site-crawler.declarationSnapshot",
  schemaVersion: 1,
  version: packageJson.version,
  declarations: declarationHashes,
};
const snapshotPath = path.join(root, "api", "declarations.sha256.json");
if (process.argv.includes("--write")) {
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
} else {
  const expected = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  assert.deepEqual(snapshot, expected, "Public declaration snapshot changed");
}
console.log(`Public API verified for ${classified.size} package exports.`);
