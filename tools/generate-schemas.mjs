import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemasModule = await import(
  pathToFileURL(path.join(root, "dist/schemas/public.js")).href
);
const directory = path.join(root, "schemas");
const expectedFiles = new Set();
for (const descriptor of schemasModule.persistentSchemas) {
  const fileName = `${descriptor.schemaId}.v${descriptor.schemaVersion}.schema.json`;
  expectedFiles.add(fileName);
  const text = `${JSON.stringify(descriptor.jsonSchema, null, 2)}\n`;
  const target = path.join(directory, fileName);
  if (process.argv.includes("--write")) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(target, text);
  } else {
    assert.equal(
      await fs.readFile(target, "utf8"),
      text,
      `Generated schema is stale: ${fileName}`,
    );
  }
}
if (process.argv.includes("--write")) {
  for (const entry of await fs.readdir(directory)) {
    if (entry.endsWith(".schema.json") && !expectedFiles.has(entry)) {
      await fs.rm(path.join(directory, entry));
    }
  }
}
console.log(
  `${expectedFiles.size} runtime schemas ${process.argv.includes("--write") ? "written" : "verified"}.`,
);
