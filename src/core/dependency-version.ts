import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function installedPackageVersion(specifier: string): string | null {
  try {
    const resolved = fileURLToPath(import.meta.resolve(specifier));
    const packagePath = findPackageJson(path.dirname(resolved));
    if (packagePath === null) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (!isRecord(parsed)) return null;
    const version = parsed["version"];
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

function findPackageJson(start: string): string | null {
  let current = path.resolve(start);
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
