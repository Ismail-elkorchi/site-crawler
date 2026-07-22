import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const required = process.argv.includes("--require");
const executable = await findChromium();
if (executable === null) {
  const message =
    "No Chromium executable was found for the Playwright integration test.";
  if (required) throw new Error(message);
  process.stderr.write(`[verify-browser] ${message} Skipping.\n`);
  process.exit(0);
}

const policySafeFixture = await requiresPolicySafeFixture(executable);
const browserEnvironment = {
  ...process.env,
  SITE_CRAWLER_RUN_BROWSER_TESTS: "1",
  SITE_CRAWLER_CHROMIUM_PATH: executable,
  ...(policySafeFixture ? { SITE_CRAWLER_BROWSER_FIXTURE: "about-blank" } : {}),
};
await runWithRetries(
  process.execPath,
  ["--test", "tests/playwright-browser.test.mjs"],
  browserEnvironment,
  3,
  60_000,
);
const fixture = policySafeFixture ? "policy-safe about:blank" : "local HTTP";
process.stderr.write(
  `[verify-browser] Browser navigation passed with ${executable} using the ${fixture} fixture.\n`,
);

async function findChromium() {
  const configured = process.env.SITE_CRAWLER_CHROMIUM_PATH;
  const playwright = await playwrightChromiumPath();
  const candidates = [
    configured,
    playwright,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter((value) => typeof value === "string" && value.length > 0);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function playwrightChromiumPath() {
  try {
    const { chromium } = await import("playwright-core");
    return chromium.executablePath();
  } catch {
    return null;
  }
}

async function requiresPolicySafeFixture(executable) {
  if (!executable.startsWith("/usr/") && !executable.startsWith("/opt/"))
    return false;
  try {
    const policy = JSON.parse(
      await fs.readFile(
        "/etc/chromium/policies/managed/000_policy_merge.json",
        "utf8",
      ),
    );
    return (
      Array.isArray(policy.URLBlocklist) && policy.URLBlocklist.includes("*")
    );
  } catch {
    return false;
  }
}

async function runWithRetries(command, args, env, attempts, timeoutMs) {
  let failure = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await run(command, args, env, timeoutMs, attempt);
      return;
    } catch (caught) {
      failure = caught;
      if (attempt < attempts) {
        process.stderr.write(
          `[verify-browser] Browser attempt ${attempt} failed; retrying after process-tree cleanup.\n`,
        );
      }
    }
  }
  throw failure ?? new Error("Browser verification failed.");
}

function run(command, args, env, timeoutMs, attempt) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    let timedOut = false;
    let forceTimer = null;
    const heartbeat = setInterval(() => {
      process.stderr.write(
        `[verify-browser] Browser attempt ${attempt} is still running.\n`,
      );
    }, 5_000);
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child.pid, "SIGTERM");
      forceTimer = setTimeout(() => {
        void terminateProcessTree(child.pid, "SIGKILL");
      }, 5_000);
    }, timeoutMs);
    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (forceTimer !== null) clearTimeout(forceTimer);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (timedOut) {
        reject(new Error(`Browser verification exceeded ${timeoutMs} ms.`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code ?? signal}`));
      }
    });
  });
}

async function terminateProcessTree(rootPid, signal) {
  if (rootPid === undefined) return;
  if (process.platform === "win32") {
    const args = ["/PID", String(rootPid), "/T"];
    if (signal === "SIGKILL") args.push("/F");
    await execFileAsync("taskkill", args).catch(() => undefined);
    return;
  }
  const descendants = await descendantPids(rootPid);
  for (const pid of descendants) kill(pid, signal);
  kill(rootPid, signal);
}

async function descendantPids(rootPid) {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid="]);
    const children = new Map();
    for (const line of stdout.split("\n")) {
      const values = line.trim().split(/\s+/u);
      if (values.length !== 2) continue;
      const pid = Number(values[0]);
      const parentPid = Number(values[1]);
      if (!Number.isInteger(pid) || !Number.isInteger(parentPid)) continue;
      const current = children.get(parentPid) ?? [];
      current.push(pid);
      children.set(parentPid, current);
    }
    const ordered = [];
    const visit = (pid) => {
      for (const child of children.get(pid) ?? []) visit(child);
      if (pid !== rootPid) ordered.push(pid);
    };
    visit(rootPid);
    return ordered;
  } catch {
    return [];
  }
}

function kill(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (caught) {
    if (!(caught instanceof Error) || !caught.message.includes("ESRCH"))
      throw caught;
  }
}
