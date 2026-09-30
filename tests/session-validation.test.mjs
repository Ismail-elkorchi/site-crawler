import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig, validateConfig } from "../dist/config/index.js";

test("persistent cookies require an enabled session", () => {
  assert.throws(
    () => validateSession({ enabled: false, persistCookies: true }),
    /session\.persistCookies requires session\.enabled to be true\./u,
  );
});

test("persistent cookies reject memory storage", () => {
  assert.throws(
    () => validateSession({ enabled: true, persistCookies: true }, "memory"),
    /Persistent cookies require filesystem-backed crawl storage\./u,
  );
});

test("cookie paths reject empty and whitespace-only values", () => {
  for (const cookieFile of ["", " ", "\t\n"]) {
    assert.throws(
      () => validateSession({ cookieFile }),
      /session\.cookieFile must not be empty\./u,
    );
  }
});

test("persistent cookies accept filesystem and SQLite storage", () => {
  for (const storage of ["filesystem", "sqlite"]) {
    for (const cookieFile of [null, "./cookies.json"]) {
      assert.doesNotThrow(() =>
        validateSession(
          { enabled: true, persistCookies: true, cookieFile },
          storage,
        ),
      );
    }
  }
});

test("memory storage accepts sessions without cookie persistence", () => {
  for (const enabled of [false, true]) {
    assert.doesNotThrow(() =>
      validateSession({ enabled, persistCookies: false }, "memory"),
    );
  }
});

function validateSession(session, storage = "filesystem") {
  validateConfig(
    resolveConfig({
      seeds: ["https://example.com/"],
      session,
      storage: { type: storage },
    }),
  );
}
