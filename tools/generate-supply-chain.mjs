import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const lock = JSON.parse(
  await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
);
const components = [];
const licenses = [];
for (const [location, metadata] of Object.entries(lock.packages ?? {})) {
  if (location === "" || !metadata || typeof metadata !== "object") continue;
  const name = packageName(location, metadata.name);
  const version =
    typeof metadata.version === "string" ? metadata.version : "unknown";
  const license = await packageLicense(location, metadata.license);
  const scope =
    location.includes("node_modules") && packageJson.devDependencies?.[name]
      ? "development"
      : "required";
  components.push({
    type: "library",
    name,
    version,
    scope,
    purl: `pkg:npm/${encodeURIComponent(name)}@${version}`,
  });
  licenses.push({ name, version, license });
}
components.sort(compareName);
licenses.sort(compareName);
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${deterministicId(`${packageJson.name}@${packageJson.version}`)}`,
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: packageJson.name,
      version: packageJson.version,
    },
  },
  components,
};
const provenance = {
  schemaId: "site-crawler.provenance",
  schemaVersion: 1,
  package: `${packageJson.name}@${packageJson.version}`,
  generatedAt: new Date().toISOString(),
  engines: packageJson.engines,
  npmLockSha256: await digestFile(path.join(root, "package-lock.json")),
  sourceTreeSha256: await digestTree(path.join(root, "src")),
  schemasSha256: await digestTree(path.join(root, "schemas")),
  apiSnapshotSha256: await digestTree(path.join(root, "api")),
};
const directory = path.join(root, "supply-chain");
if (process.argv.includes("--write")) {
  await fs.mkdir(directory, { recursive: true });
  await writeJson(path.join(directory, "sbom.cdx.json"), sbom);
  await writeJson(path.join(directory, "licenses.json"), {
    schemaId: "site-crawler.licenses",
    schemaVersion: 1,
    packages: licenses,
  });
  await writeJson(path.join(directory, "provenance.json"), provenance);
} else {
  await assertJson(path.join(directory, "sbom.cdx.json"), sbom, [
    "serialNumber",
  ]);
  await assertJson(path.join(directory, "licenses.json"), {
    schemaId: "site-crawler.licenses",
    schemaVersion: 1,
    packages: licenses,
  });
  const expected = JSON.parse(
    await fs.readFile(path.join(directory, "provenance.json"), "utf8"),
  );
  const comparable = { ...provenance, generatedAt: expected.generatedAt };
  if (JSON.stringify(comparable) !== JSON.stringify(expected))
    throw new Error("Supply-chain provenance is stale.");
}
console.log(
  `${components.length} dependency components ${process.argv.includes("--write") ? "recorded" : "verified"}.`,
);

function packageName(location, declared) {
  if (typeof declared === "string") return declared;
  const marker = "node_modules/";
  const index = location.lastIndexOf(marker);
  return index < 0 ? location : location.slice(index + marker.length);
}
async function packageLicense(location, declared) {
  if (typeof declared === "string") return declared;
  try {
    const p = JSON.parse(
      await fs.readFile(path.join(root, location, "package.json"), "utf8"),
    );
    return typeof p.license === "string" ? p.license : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}
function compareName(a, b) {
  return `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`);
}
function deterministicId(value) {
  const h = createHash("sha256").update(value).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function digestFile(file) {
  return createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");
}
async function digestTree(directory) {
  const hash = createHash("sha256");
  for (const file of await files(directory)) {
    hash.update(path.relative(root, file));
    hash.update(await fs.readFile(file));
  }
  return hash.digest("hex");
}
async function files(directory) {
  const out = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...(await files(child)));
    else if (entry.isFile()) out.push(child);
  }
  return out.sort();
}
async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
async function assertJson(file, actual, ignored = []) {
  const expected = JSON.parse(await fs.readFile(file, "utf8"));
  for (const key of ignored) actual[key] = expected[key];
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${path.basename(file)} is stale.`);
}
