import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const files = [];
for (const target of await collect(root)) {
  const relative = path.relative(root, target);
  if (excluded(relative)) continue;
  const bytes = await fs.readFile(target);
  files.push({
    path: relative,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  });
}
files.sort((left, right) => left.path.localeCompare(right.path));
const manifest = {
  schemaId: "site-crawler.releaseManifest",
  schemaVersion: 1,
  package: packageJson.name,
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
};
await fs.mkdir(path.join(root, "release"), { recursive: true });
await fs.writeFile(
  path.join(root, "release", "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

async function collect(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await collect(target)));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

function excluded(relative) {
  return (
    relative === "release/release-manifest.json" ||
    relative === "release/provenance.json" ||
    ["node_modules/", ".git/", "dist/", "coverage/"].some((prefix) =>
      relative.startsWith(prefix),
    ) ||
    relative.endsWith(".tgz") ||
    relative.endsWith(".zip")
  );
}
