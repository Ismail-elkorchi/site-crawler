import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "site-crawler-clean-install-"),
);
const project = path.join(temporary, "project");
const cache = path.join(temporary, "npm-cache");

try {
  await fs.mkdir(project);
  await Promise.all(
    ["package.json", "package-lock.json"].map(
      async (file) =>
        await fs.copyFile(path.join(root, file), path.join(project, file)),
    ),
  );
  await run(
    npmCommand(),
    [
      "ci",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry=https://registry.npmjs.org/",
      `--cache=${cache}`,
      "--prefer-online",
    ],
    project,
  );
  const packageJson = JSON.parse(
    await fs.readFile(path.join(project, "package.json"), "utf8"),
  );
  for (const name of [
    "@ismail-elkorchi/html-parser",
    "@ismail-elkorchi/xml-parser",
  ]) {
    const installed = JSON.parse(
      await fs.readFile(
        path.join(project, "node_modules", ...name.split("/"), "package.json"),
        "utf8",
      ),
    );
    assert.equal(installed.name, name);
    assert.equal(installed.version, packageJson.dependencies[name]);
  }
  console.log(
    "Clean public-registry installation verified with a fresh cache.",
  );
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
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
      else
        reject(
          new Error(
            `${command} failed (${signal === null ? `exit ${code}` : `signal ${signal}`}).`,
          ),
        );
    });
  });
}
