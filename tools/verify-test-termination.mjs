import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const testsDirectory = path.join(root, "tests");
const repeats = positiveInteger(
  process.env.SITE_CRAWLER_TERMINATION_REPEATS,
  5,
);
const timeoutMs = positiveInteger(
  process.env.SITE_CRAWLER_TERMINATION_TIMEOUT_MS,
  60_000,
);
const files = (await fs.readdir(testsDirectory))
  .filter((fileName) => fileName.endsWith(".test.mjs"))
  .sort()
  .map((fileName) => path.join("tests", fileName));

if (files.length === 0) throw new Error("No test files were found.");

for (let iteration = 1; iteration <= repeats; iteration += 1) {
  process.stderr.write(
    `[termination] whole-suite iteration ${iteration}/${repeats}\n`,
  );
  const outcome = await runSuite(files, timeoutMs);
  if (outcome.kind === "timeout") {
    throw new Error(
      `Whole test suite did not terminate within ${timeoutMs} ms on iteration ${iteration}.\n${outcome.output}`,
    );
  }
  if (outcome.code !== 0) {
    throw new Error(
      `Whole test suite failed on iteration ${iteration} with ${String(outcome.code ?? outcome.signal)}.\n${outcome.output}`,
    );
  }
  process.stderr.write(
    `[termination] iteration ${iteration} exited cleanly in ${outcome.durationMs.toFixed(0)} ms\n`,
  );
}

process.stderr.write(
  `[termination] ${repeats} whole-suite executions terminated cleanly.\n`,
);

function runSuite(testFiles, timeout) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(
      process.execPath,
      ["--test", "--test-isolation=none", "--test-concurrency=1", ...testFiles],
      {
        cwd: root,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      },
    );
    const chunks = [];
    let size = 0;
    const append = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(bytes);
      size += bytes.length;
      while (size > 131_072 && chunks.length > 1) {
        const removed = chunks.shift();
        if (removed !== undefined) size -= removed.length;
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...outcome,
        durationMs: performance.now() - started,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    };
    const timer = setTimeout(() => {
      terminate(child, "SIGTERM");
      const force = setTimeout(() => terminate(child, "SIGKILL"), 2_000);
      force.unref();
      finish({ kind: "timeout" });
    }, timeout);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) =>
      finish({ kind: "exit", code, signal }),
    );
  });
}

function terminate(child, signal) {
  if (child.pid === undefined || child.exitCode !== null) return;
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

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}
