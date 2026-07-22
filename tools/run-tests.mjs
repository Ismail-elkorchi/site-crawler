import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const testsDirectory = path.join(repositoryRoot, "tests");
const timeoutMs = positiveInteger(
  process.env.SITE_CRAWLER_TEST_TIMEOUT_MS,
  120_000,
);
const { repeat, requestedFiles } = parseArguments(process.argv.slice(2));
const allFiles = (await fs.readdir(testsDirectory))
  .filter((fileName) => fileName.endsWith(".test.mjs"))
  .sort();
const files =
  requestedFiles.length === 0
    ? allFiles
    : requestedFiles.map((fileName) => normalizeTestFile(fileName, allFiles));

let activeChild = null;
const stopActiveChild = () => terminateChild(activeChild, "SIGTERM");
process.once("SIGINT", stopActiveChild);
process.once("SIGTERM", stopActiveChild);

try {
  for (let iteration = 1; iteration <= repeat; iteration += 1) {
    if (repeat > 1) {
      process.stderr.write(`[tests] iteration ${iteration}/${repeat}\n`);
    }
    for (const fileName of files) {
      process.stderr.write(`[tests] ${fileName}\n`);
      activeChild = spawnTest(fileName);
      const outcome = await waitForChild(activeChild, timeoutMs);
      activeChild = null;
      if (outcome.kind === "timeout") {
        throw new Error(
          `Test file ${fileName} exceeded ${timeoutMs} ms and was terminated.`,
        );
      }
      if (outcome.code !== 0) {
        throw new Error(
          `Test file ${fileName} exited with ${String(outcome.code ?? outcome.signal)}.`,
        );
      }
    }
  }
} finally {
  process.removeListener("SIGINT", stopActiveChild);
  process.removeListener("SIGTERM", stopActiveChild);
  terminateChild(activeChild, "SIGKILL");
}

process.stderr.write(
  `[tests] completed ${files.length * repeat} isolated test-file run(s).\n`,
);

function spawnTest(fileName) {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const args = ["--test", "--test-concurrency=1"];
  if (major >= 24) args.push("--test-isolation=none");
  args.push(path.join("tests", fileName));
  return spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
}

function waitForChild(child, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      terminateChild(child, "SIGTERM");
      const killTimer = setTimeout(() => {
        terminateChild(child, "SIGKILL");
      }, 2_000);
      killTimer.unref();
      settled = true;
      resolve({ kind: "timeout" });
    }, timeout);
    timer.unref();
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ kind: "exit", code, signal });
    });
  });
}

function terminateChild(child, signal) {
  if (child === null || child.pid === undefined || child.exitCode !== null) {
    return;
  }
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
}

function isMissingProcess(error) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ESRCH" || error.code === "EPERM")
  );
}

function parseArguments(args) {
  let repeat = 1;
  const requestedFiles = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--repeat") {
      const count = args[index + 1];
      repeat = positiveInteger(count, 0);
      if (repeat === 0)
        throw new Error("--repeat requires a positive integer.");
      index += 1;
      continue;
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Unknown test-runner argument: ${String(value)}`);
    }
    requestedFiles.push(value);
  }
  return { repeat, requestedFiles };
}

function normalizeTestFile(value, availableFiles) {
  const fileName = path.basename(value);
  if (!availableFiles.includes(fileName)) {
    throw new Error(`Unknown test file: ${value}`);
  }
  return fileName;
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
