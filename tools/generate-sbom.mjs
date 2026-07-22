import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
);
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const components = [];
for (const [location, value] of Object.entries(lock.packages ?? {})) {
  if (location === "" || typeof value !== "object" || value === null) continue;
  const name = value.name ?? packageName(location);
  const version = value.version;
  if (typeof name !== "string" || typeof version !== "string") continue;
  components.push({
    type: "library",
    name,
    version,
    purl: `pkg:npm/${encodeURIComponent(name)}@${version}`,
    ...(typeof value.resolved === "string"
      ? { externalReferences: [{ type: "distribution", url: value.resolved }] }
      : {}),
    ...(typeof value.integrity === "string"
      ? {
          hashes: [
            {
              alg: "SHA-512",
              content: value.integrity.replace(/^sha512-/, ""),
            },
          ],
        }
      : {}),
  });
}
components.sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(
    `${right.name}@${right.version}`,
  ),
);
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      name: packageJson.name,
      version: packageJson.version,
    },
    tools: [
      {
        vendor: "site-crawler",
        name: "generate-sbom",
        version: packageJson.version,
      },
    ],
  },
  components,
};
await fs.mkdir(path.join(root, "release"), { recursive: true });
await fs.writeFile(
  path.join(root, "release", "sbom.cdx.json"),
  `${JSON.stringify(sbom, null, 2)}\n`,
);

function packageName(location) {
  const parts = location.split("node_modules/");
  return parts.at(-1) ?? location;
}
