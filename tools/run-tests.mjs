import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const testDirectory = path.join(root, "tests");
const available = (await fs.readdir(testDirectory))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();
const requested = process.argv.slice(2);
const selected =
  requested.length === 0
    ? available
    : requested.map((value) => {
        const name = path.basename(value);
        if (!available.includes(name))
          throw new Error(`Unknown test: ${value}`);
        return name;
      });

if (selected.length === 0) throw new Error("No tests were found.");

const timeoutMs = positiveInteger(
  process.env["SITE_CRAWLER_TEST_SUITE_TIMEOUT_MS"],
  10 * 60_000,
);
const child = spawn(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    "--test-timeout=120000",
    ...selected.map((name) => path.join("tests", name)),
  ],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  },
);

const terminate = (signal) => {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
};
process.once("SIGINT", () => terminate("SIGTERM"));
process.once("SIGTERM", () => terminate("SIGTERM"));

const code = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    terminate("SIGTERM");
    const force = setTimeout(() => terminate("SIGKILL"), 2_000);
    force.unref();
    reject(new Error(`Test suite exceeded ${timeoutMs} ms.`));
  }, timeoutMs);
  timeout.unref();
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", (exitCode, signal) => {
    clearTimeout(timeout);
    if (signal !== null) reject(new Error(`Test suite exited with ${signal}.`));
    else resolve(exitCode ?? 1);
  });
});

process.exitCode = code;

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function isMissingProcess(error) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ESRCH" || error.code === "EPERM")
  );
}
