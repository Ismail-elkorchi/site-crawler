import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const manifestBytes = await fs.readFile(
  path.join(root, "release", "release-manifest.json"),
);
const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [
    {
      name: `${packageJson.name}@${packageJson.version}`,
      digest: {
        sha256: createHash("sha256").update(manifestBytes).digest("hex"),
      },
    },
  ],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://site-crawler.dev/build/source-release/v1",
      externalParameters: { packageVersion: packageJson.version },
      internalParameters: {
        node: process.versions.node,
        platform: process.platform,
        architecture: process.arch,
      },
      resolvedDependencies: [
        {
          uri: "package-lock.json",
          digest: {
            sha256: createHash("sha256")
              .update(await fs.readFile(path.join(root, "package-lock.json")))
              .digest("hex"),
          },
        },
      ],
    },
    runDetails: {
      builder: { id: "https://site-crawler.dev/tools/generate-provenance" },
      metadata: {
        invocationId: randomUUID(),
        startedOn: new Date().toISOString(),
        finishedOn: new Date().toISOString(),
      },
    },
  },
};
await fs.writeFile(
  path.join(root, "release", "provenance.json"),
  `${JSON.stringify(statement, null, 2)}\n`,
);
