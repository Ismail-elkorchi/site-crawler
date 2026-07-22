import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const sbom = JSON.parse(
  await fs.readFile(path.join(root, "release", "sbom.cdx.json"), "utf8"),
);
const manifest = JSON.parse(
  await fs.readFile(
    path.join(root, "release", "release-manifest.json"),
    "utf8",
  ),
);
const provenance = JSON.parse(
  await fs.readFile(path.join(root, "release", "provenance.json"), "utf8"),
);
const lock = JSON.parse(
  await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
);
assert.equal(lock.lockfileVersion, 3);
const rootLock = lock.packages?.[""];
assert.deepEqual(rootLock?.dependencies, packageJson.dependencies);
assert.deepEqual(rootLock?.devDependencies, packageJson.devDependencies);
for (const [location, metadata] of Object.entries(lock.packages ?? {})) {
  if (location === "") continue;
  assert.equal(
    typeof metadata?.resolved === "string" &&
      metadata.resolved.startsWith("https://registry.npmjs.org/"),
    true,
    `${location} public npm resolution`,
  );
  assert.match(metadata.integrity ?? "", /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
}
assert.equal(sbom.metadata.component.version, packageJson.version);
assert.equal(manifest.version, packageJson.version);
assert.equal(
  provenance.predicate.buildDefinition.externalParameters.packageVersion,
  packageJson.version,
);
for (const file of manifest.files) {
  const bytes = await fs.readFile(path.join(root, file.path));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    file.sha256,
    file.path,
  );
  assert.equal(bytes.byteLength, file.bytes, file.path);
}
console.log(
  `Verified ${manifest.fileCount} source files and ${sbom.components.length} SBOM components.`,
);
