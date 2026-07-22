#!/usr/bin/env node
import { parseArgs, usage } from "./args.js";
import { runCommand } from "./runner.js";

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  try {
    const command = parseArgs(argv);
    if (command.command === "help") {
      console.log(usage());
      return 0;
    }
    const result = await runCommand(command);
    if (!command.quiet) console.log(JSON.stringify(result.value, null, 2));
    return result.exitCode;
  } catch (caught) {
    console.error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
