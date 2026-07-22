import fs from "node:fs/promises";
import { parseCrawlConfig } from "../config/input/parse-config.js";
import { resolveConfig } from "../config/resolve.js";

export interface ConfigValidationReport {
  readonly valid: boolean;
  readonly validatedAt: string;
  readonly config: unknown | null;
  readonly issues: readonly string[];
}

export async function validateConfigFile(
  filePath: string,
): Promise<ConfigValidationReport> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    const config = resolveConfig(parseCrawlConfig(value));
    return {
      valid: true,
      validatedAt: new Date().toISOString(),
      config,
      issues: [],
    };
  } catch (caught) {
    return {
      valid: false,
      validatedAt: new Date().toISOString(),
      config: null,
      issues: [caught instanceof Error ? caught.message : String(caught)],
    };
  }
}
