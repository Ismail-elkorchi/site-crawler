import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPackageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "site-crawler-package-"),
);

try {
  log("building release output");
  await run(npmCommand(), ["run", "build"], root);

  const tarball = await packReleasePackage(temporary);
  const dependencySources =
    await stageInstalledProductionDependencies(temporary);
  const consumer = path.join(temporary, "consumer");
  await fs.mkdir(consumer);
  const dependencies = Object.fromEntries([
    ["site-crawler", localPackageSpec(consumer, tarball)],
    ...dependencySources.map(({ name, directory }) => [
      name,
      localPackageSpec(consumer, directory),
    ]),
  ]);
  await fs.writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "site-crawler-consumer",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2,
    ),
  );

  log("installing release tarball and sanitized dependency sources offline");
  await run(
    npmCommand(),
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--install-links=true",
    ],
    consumer,
  );

  await verifyRuntimeImports(consumer);
  await verifyTypeScriptContracts(consumer);
  await verifyInstalledCli(consumer, temporary);
  log("package verification passed");
} finally {
  await removeTemporaryDirectory(temporary);
}

async function packReleasePackage(temporary) {
  log("staging and packing release tarball");
  const packageJson = rootPackageJson;
  const staging = path.join(temporary, "site-crawler-package-source");
  await fs.mkdir(staging);

  const includedPaths = [
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    ...(Array.isArray(packageJson.files) ? packageJson.files : []),
  ];
  for (const relativePath of new Set(includedPaths)) {
    const source = path.join(root, relativePath);
    const destination = path.join(staging, relativePath);
    const stat = await fs.stat(source).catch(() => null);
    if (stat === null) continue;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (stat.isDirectory()) {
      await fs.cp(source, destination, { recursive: true, dereference: true });
    } else {
      await fs.copyFile(source, destination);
    }
  }

  const stagedPackageJsonPath = path.join(staging, "package.json");
  const stagedPackageJson = JSON.parse(
    await fs.readFile(stagedPackageJsonPath, "utf8"),
  );
  delete stagedPackageJson.scripts;
  delete stagedPackageJson.devDependencies;
  await fs.writeFile(
    stagedPackageJsonPath,
    `${JSON.stringify(stagedPackageJson, null, 2)}\n`,
  );

  const packOutput = await runCapture(
    npmCommand(),
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
    staging,
  );
  const packed = JSON.parse(packOutput);
  assert.equal(Array.isArray(packed), true);
  const descriptor = packed[0];
  const fileName = descriptor?.filename;
  assert.equal(typeof fileName, "string");
  assertPackageFiles(descriptor?.files, stagedPackageJson);
  await fs.rm(staging, { recursive: true, force: true });
  return path.join(temporary, fileName);
}

function assertPackageFiles(files, packageJson) {
  assert.equal(Array.isArray(files), true, "npm pack file manifest");
  const paths = new Set(files.map((file) => file.path));
  const expected = new Set(["package.json", "README.md", "LICENSE"]);
  if (typeof packageJson.bin === "object" && packageJson.bin !== null) {
    for (const value of Object.values(packageJson.bin)) {
      if (typeof value === "string") expected.add(stripDotSlash(value));
    }
  }
  collectExportTargets(packageJson.exports, expected);
  for (const required of expected) {
    assert.equal(paths.has(required), true, `packed file ${required}`);
  }
}

function collectExportTargets(value, targets) {
  if (typeof value === "string") {
    targets.add(stripDotSlash(value));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value))
    collectExportTargets(child, targets);
}

function stripDotSlash(value) {
  return value.startsWith("./") ? value.slice(2) : value;
}

async function stageInstalledProductionDependencies(temporary) {
  const lock = JSON.parse(
    await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
  );
  const entries = Object.entries(lock.packages ?? {})
    .filter(
      ([location, metadata]) =>
        location.startsWith("node_modules/") &&
        metadata !== null &&
        typeof metadata === "object" &&
        metadata.dev !== true,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  const sourceRoot = path.join(temporary, "dependency-sources");
  await fs.mkdir(sourceRoot);
  const stagedDependencies = [];

  for (const [location] of entries) {
    const source = path.join(root, location);
    const packageJsonPath = path.join(source, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    const name = packageJson.name;
    assert.equal(typeof name, "string", `${location} package name`);
    const sanitized = path.join(
      sourceRoot,
      name.replaceAll("/", "__").replaceAll("@", ""),
    );
    await fs.cp(source, sanitized, {
      recursive: true,
      dereference: true,
      filter: (candidate) => path.basename(candidate) !== "node_modules",
    });
    const sanitizedPackageJsonPath = path.join(sanitized, "package.json");
    const sanitizedPackageJson = JSON.parse(
      await fs.readFile(sanitizedPackageJsonPath, "utf8"),
    );
    delete sanitizedPackageJson.scripts;
    delete sanitizedPackageJson.devDependencies;
    delete sanitizedPackageJson.publishConfig;
    await fs.writeFile(
      sanitizedPackageJsonPath,
      `${JSON.stringify(sanitizedPackageJson, null, 2)}\n`,
    );
    stagedDependencies.push({ name, directory: sanitized });
  }

  log(`staged ${stagedDependencies.length} sanitized runtime dependencies`);
  return stagedDependencies;
}

function localPackageSpec(consumer, packagePath) {
  const relative = path
    .relative(consumer, packagePath)
    .split(path.sep)
    .join("/");
  return `file:${relative.startsWith(".") ? relative : `./${relative}`}`;
}

async function verifyRuntimeImports(consumer) {
  await fs.writeFile(
    path.join(consumer, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { SiteCrawler, parseCrawlConfig } from "site-crawler";
import * as config from "site-crawler/config";
import { CrawlEventHub } from "site-crawler/events";
import * as adapters from "site-crawler/adapters";
import * as schemas from "site-crawler/schemas";
import { extractHtmlFacts, extractXmlResource } from "site-crawler/experimental";
import { PlaywrightRenderAdapter } from "site-crawler/playwright";
import { SqliteResultStore } from "site-crawler/storage";
import { CrawlIndex } from "site-crawler/query";
import { createOpenTelemetryHooks } from "site-crawler/opentelemetry";
import { runtimeContracts } from "site-crawler/contracts";
import { ContentAddressedEvidenceStore } from "site-crawler/evidence";
import { replayRun } from "site-crawler/replay";
import { compareRuns } from "site-crawler/diff";
import { openRunReader } from "site-crawler/runs";
import { inspectRun } from "site-crawler/operations";
import { SqliteWorkerCoordinator } from "site-crawler/workers";
import { runSecurityDoctor } from "site-crawler/security";
assert.equal(typeof SiteCrawler, "function");
assert.equal(typeof parseCrawlConfig, "function");
assert.equal(typeof config.resolveConfig, "function");
assert.equal(typeof CrawlEventHub, "function");
assert.deepEqual(Object.keys(adapters), []);
assert.equal(typeof schemas.schemaForId, "function");
assert.equal(typeof schemas.validatePersistentValue, "function");
assert.equal(Array.isArray(schemas.persistentSchemas), true);
assert.equal(typeof extractHtmlFacts, "function");
assert.equal(typeof extractXmlResource, "function");
assert.equal(typeof PlaywrightRenderAdapter, "function");
assert.equal(typeof SqliteResultStore, "function");
assert.equal(typeof CrawlIndex, "function");
assert.equal(typeof createOpenTelemetryHooks, "function");
assert.equal(Array.isArray(runtimeContracts), true);
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
const hooks = createOpenTelemetryHooks({
  meter: {
    createCounter() { return { add() {} }; },
    createHistogram() { return { record() {} }; },
  },
  tracer: {
    startSpan() {
      return {
        setAttribute() { return this; },
        recordException() {},
        setStatus() { return this; },
        end() {},
      };
    },
  },
});
assert.equal(typeof hooks.onEvent, "function");
`,
  );
  await run(process.execPath, [path.join(consumer, "smoke.mjs")], consumer);
  log("runtime subpath imports passed");
}

async function verifyTypeScriptContracts(consumer) {
  const typeRoots = path.join(root, "node_modules", "@types");
  await fs.writeFile(
    path.join(consumer, "consumer.ts"),
    `import { SiteCrawler, type CrawlResult } from "site-crawler";
import type { HttpClient, RenderAdapter } from "site-crawler/adapters";
import type { CrawledHtmlPage, CrawledXmlResource } from "site-crawler/schemas";
import type { PlaywrightRenderAdapterOptions } from "site-crawler/playwright";
import type { QueryStore } from "site-crawler/storage";
import type { CrawlIndexOptions } from "site-crawler/query";
import type { OpenTelemetryCrawlAdapterOptions } from "site-crawler/opentelemetry";
import type { EvidenceReference } from "site-crawler/evidence";
import type { ReplayReport } from "site-crawler/replay";
import type { CrawlDiffReport } from "site-crawler/diff";
import type { WorkerRecord } from "site-crawler/workers";
import type { SecurityAudit } from "site-crawler/security";
const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  parsing: {
    html: { maxDepth: 64 },
    xml: { maxDepth: 32 },
  },
  network: { autoThrottle: { enabled: false } },
});
const result: Promise<CrawlResult> = crawler.run();
void result;
type Contracts =
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
const contract: Contracts | null = null;
void contract;
`,
  );
  await fs.writeFile(
    path.join(consumer, "tsconfig.json"),
    JSON.stringify(
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
          typeRoots: [typeRoots],
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    ),
  );
  log("checking public TypeScript contracts");
  await run(
    process.execPath,
    [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      path.join(consumer, "tsconfig.json"),
    ],
    consumer,
  );
  log("public TypeScript contracts passed");
}

async function verifyInstalledCli(consumer, temporary) {
  const fixture = await listen();
  try {
    const output = path.join(temporary, "cli-output");
    const cli = path.join(
      consumer,
      "node_modules",
      "site-crawler",
      "dist",
      "cli",
      "index.js",
    );
    log("running installed CLI smoke crawl");
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
    const runDirectories = await fs.readdir(output);
    assert.equal(runDirectories.length, 1);
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(output, runDirectories[0], "manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.crawlerVersion, rootPackageJson.version);
    assert.equal(manifest.schemaId, "site-crawler.runManifest");
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.runtime.resultStorage, "sqlite");
    assert.equal(manifest.runtime.frontierBackend, "sqlite");
    assert.equal(manifest.runtime.frontierOrder, "priority");
    log("installed CLI smoke crawl passed");
  } finally {
    await fixture.close();
  }
}

async function listen() {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      "<html><head><title>Package smoke</title></head><body>ok</body></html>",
    );
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

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function log(message) {
  process.stderr.write(`[verify-package] ${message}\n`);
}

async function removeTemporaryDirectory(directory) {
  if (process.env.SITE_CRAWLER_KEEP_VERIFY_TEMP === "1") {
    log(`preserving verification directory ${directory}`);
    return;
  }

  try {
    if (process.platform === "win32") {
      await run(
        "cmd.exe",
        ["/d", "/s", "/c", "rd", "/s", "/q", directory],
        root,
      );
      return;
    }
    await run("rm", ["-rf", "--", directory], root);
  } catch {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
