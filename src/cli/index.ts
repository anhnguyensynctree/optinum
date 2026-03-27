import { runTestCommand } from "./commands/test";
import { runInit } from "./commands/init";

const args = process.argv.slice(2);
const subcommand = args[0];

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function main(): Promise<void> {
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log("Usage: optinum <command> [options]");
    console.log("");
    console.log("Commands:");
    console.log("  init       Auto-detect project and write optinum.config.ts");
    console.log("  test       Generate tests from a diff");
    console.log("  benchmark  Run against OSS benchmark fixtures");
    console.log("  catalog    Manage the blind-spot pattern catalog");
    process.exit(0);
  }

  const flags = parseFlags(args.slice(1));

  switch (subcommand) {
    case "init":
      await runInit(process.cwd());
      break;
    case "test":
      await runTestCommand(flags);
      break;
    case "benchmark":
      console.log("benchmark: not yet implemented");
      break;
    case "catalog":
      console.log("catalog: not yet implemented");
      break;
    default:
      console.error(`Unknown command: ${subcommand}`);
      console.error("Run `optinum --help` for usage.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
