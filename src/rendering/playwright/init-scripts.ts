import type { BrowserContext } from "playwright-core";

export async function installInitScripts(
  context: BrowserContext,
  scripts: readonly string[] | undefined,
): Promise<void> {
  if (scripts === undefined) return;
  for (const content of scripts) await context.addInitScript({ content });
}
