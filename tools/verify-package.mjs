import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const packageName = packageJson.name;
assert.equal(packageName, "@ismail-elkorchi/site-crawler");

const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "site-crawler-package-"),
);
const consumer = path.join(temporary, "consumer");
const cache = path.join(temporary, "npm-cache");

try {
  await run(npmCommand(), ["run", "build"], root);
  const tarball = await pack(temporary);
  await fs.mkdir(consumer);
  await fs.writeFile(
    path.join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: "site-crawler-package-consumer",
        private: true,
        type: "module",
        dependencies: {
          [packageName]: localPackageSpec(consumer, tarball),
        },
      },
      null,
      2,
    )}\n`,
  );
  await run(
    npmCommand(),
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry=https://registry.npmjs.org/",
      `--cache=${cache}`,
      "--prefer-online",
    ],
    consumer,
  );
  await verifyRuntimeImports();
  await verifyTypeScriptContracts();
  await verifyInstalledCli();
  process.stdout.write(
    "Packed package passed a clean public-registry consumer installation.\n",
  );
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

async function pack(destination) {
  const output = await runCapture(
    npmCommand(),
    ["pack", "--ignore-scripts", "--json", "--pack-destination", destination],
    root,
  );
  const descriptors = JSON.parse(output);
  assert.equal(Array.isArray(descriptors), true);
  const descriptor = descriptors[0];
  assert.equal(typeof descriptor?.filename, "string");
  assertPackageFiles(descriptor.files);
  return path.join(destination, descriptor.filename);
}

function assertPackageFiles(files) {
  assert.equal(Array.isArray(files), true, "npm pack file manifest");
  const paths = new Set(files.map((file) => file.path));
  const required = new Set(["package.json", "README.md", "LICENSE"]);
  for (const target of Object.values(packageJson.bin ?? {})) {
    if (typeof target === "string") required.add(stripDotSlash(target));
  }
  collectExportTargets(packageJson.exports, required);
  for (const file of required) {
    assert.equal(paths.has(file), true, `packed file ${file}`);
  }
}

function collectExportTargets(value, targets) {
  if (typeof value === "string") {
    targets.add(stripDotSlash(value));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value)) {
    collectExportTargets(child, targets);
  }
}

async function verifyRuntimeImports() {
  await fs.writeFile(
    path.join(consumer, "smoke.mjs"),
    `import assert from "node:assert/strict";
import {
  CrawlEventHub,
  SiteCrawler,
  parseCrawlConfig,
  resolveConfig,
} from "@ismail-elkorchi/site-crawler";
import * as schemas from "@ismail-elkorchi/site-crawler/schemas";
import { PlaywrightRenderAdapter } from "@ismail-elkorchi/site-crawler/playwright";
import { SqliteResultStore } from "@ismail-elkorchi/site-crawler/storage";
import { CrawlIndex } from "@ismail-elkorchi/site-crawler/query";
import { createOpenTelemetryHooks } from "@ismail-elkorchi/site-crawler/opentelemetry";
import { ContentAddressedEvidenceStore } from "@ismail-elkorchi/site-crawler/evidence";
import { replayRun } from "@ismail-elkorchi/site-crawler/replay";
import { compareRuns } from "@ismail-elkorchi/site-crawler/diff";
import { openRunReader } from "@ismail-elkorchi/site-crawler/runs";
import { inspectRun } from "@ismail-elkorchi/site-crawler/operations";
import { SqliteWorkerCoordinator } from "@ismail-elkorchi/site-crawler/workers";
import { runSecurityDoctor } from "@ismail-elkorchi/site-crawler/security";

assert.equal(typeof SiteCrawler, "function");
assert.equal(typeof parseCrawlConfig, "function");
assert.equal(typeof resolveConfig, "function");
assert.equal(typeof CrawlEventHub, "function");
assert.equal(typeof schemas.schemaForId, "function");
assert.equal(typeof schemas.validatePersistentValue, "function");
assert.equal(Array.isArray(schemas.runtimeContracts), true);
assert.equal(typeof PlaywrightRenderAdapter, "function");
assert.equal(typeof SqliteResultStore, "function");
assert.equal(typeof CrawlIndex, "function");
assert.equal(typeof createOpenTelemetryHooks, "function");
assert.equal(typeof ContentAddressedEvidenceStore, "function");
assert.equal(typeof replayRun, "function");
assert.equal(typeof compareRuns, "function");
assert.equal(typeof openRunReader, "function");
assert.equal(typeof inspectRun, "function");
assert.equal(typeof SqliteWorkerCoordinator, "function");
assert.equal(typeof runSecurityDoctor, "function");

const renderer = new PlaywrightRenderAdapter({ browser: "chromium" });
assert.equal(renderer.name, "playwright");
await renderer.close();
`,
  );
  await run(process.execPath, ["smoke.mjs"], consumer);
}

async function verifyTypeScriptContracts() {
  await fs.writeFile(
    path.join(consumer, "consumer.ts"),
    `import {
  SiteCrawler,
  type CrawlResult,
  type HttpClient,
  type RenderAdapter,
} from "@ismail-elkorchi/site-crawler";
import type {
  CrawledHtmlPage,
  CrawledXmlResource,
} from "@ismail-elkorchi/site-crawler/schemas";
import type { PlaywrightRenderAdapterOptions } from "@ismail-elkorchi/site-crawler/playwright";
import type { QueryStore } from "@ismail-elkorchi/site-crawler/storage";
import type { CrawlIndexOptions } from "@ismail-elkorchi/site-crawler/query";
import type { OpenTelemetryCrawlAdapterOptions } from "@ismail-elkorchi/site-crawler/opentelemetry";
import type { EvidenceReference } from "@ismail-elkorchi/site-crawler/evidence";
import type { ReplayReport } from "@ismail-elkorchi/site-crawler/replay";
import type { CrawlDiffReport } from "@ismail-elkorchi/site-crawler/diff";
import type { WorkerRecord } from "@ismail-elkorchi/site-crawler/workers";
import type { SecurityAudit } from "@ismail-elkorchi/site-crawler/security";

const crawler = new SiteCrawler({ seeds: ["https://example.com/"] });
const result: Promise<CrawlResult> = crawler.run();
void result;
type PublicContract =
  | HttpClient
  | RenderAdapter
  | CrawledHtmlPage
  | CrawledXmlResource
  | PlaywrightRenderAdapterOptions
  | QueryStore
  | CrawlIndexOptions
  | OpenTelemetryCrawlAdapterOptions
  | EvidenceReference
  | ReplayReport
  | CrawlDiffReport
  | WorkerRecord
  | SecurityAudit;
const contract: PublicContract | null = null;
void contract;
`,
  );
  await fs.writeFile(
    path.join(consumer, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2024",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          skipLibCheck: false,
          noEmit: true,
          types: ["node"],
          typeRoots: [path.join(root, "node_modules", "@types")],
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await run(
    process.execPath,
    [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "."],
    consumer,
  );
}

async function verifyInstalledCli() {
  const fixture = await listen();
  try {
    const output = path.join(temporary, "cli-output");
    const cli = path.join(
      consumer,
      "node_modules",
      "@ismail-elkorchi",
      "site-crawler",
      "dist",
      "cli",
      "index.js",
    );
    await run(
      process.execPath,
      [
        cli,
        "crawl",
        `${fixture.origin}/`,
        "--ignore-robots",
        "--no-discover-sitemaps",
        "--max-scheduled-requests",
        "1",
        "--max-fetched-resources",
        "1",
        "--out",
        output,
        "--quiet",
      ],
      consumer,
    );
    const directories = await fs.readdir(output);
    assert.equal(directories.length, 1);
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(output, directories[0], "manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.crawlerVersion, packageJson.version);
    assert.equal(manifest.schemaId, "site-crawler.runManifest");
    assert.equal(manifest.schemaVersion, 1);
  } finally {
    await fixture.close();
  }
}

async function listen() {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<html><body>package smoke</body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function localPackageSpec(fromDirectory, target) {
  const relative = path
    .relative(fromDirectory, target)
    .split(path.sep)
    .join("/");
  return `file:${relative.startsWith(".") ? relative : `./${relative}`}`;
}

function stripDotSlash(value) {
  return value.startsWith("./") ? value.slice(2) : value;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function runCapture(command, args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}
