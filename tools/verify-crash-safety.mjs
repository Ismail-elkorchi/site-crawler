import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FrontierJournal } from "../dist/frontier/journal.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const point of ["before-journal-append", "after-journal-append"]) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), `site-crawler-crash-${point}-`),
  );
  try {
    const code = await runChild(directory, point);
    assert.equal(code, 86);
    const journal = new FrontierJournal(
      path.join(directory, "frontier.journal.ndjson"),
      true,
    );
    const records = await journal.load();
    await journal.close();
    assert.equal(records.length, point === "before-journal-append" ? 2 : 3);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
console.log("Crash-safety fault points preserved a valid frontier journal.");

async function runChild(directory, point) {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "tools", "crash-fixture.mjs"), directory, point],
      {
        cwd: root,
        stdio: "ignore",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}
