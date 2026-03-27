import * as path from "path";
import { runBenchmark } from "../../benchmark/runner";

interface BenchmarkCliArgs {
  repo: string;
  range: string;
  output?: string;
}

function parseRange(range: string): { fromCommit: string; toCommit: string } {
  const parts = range.split("..");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid range format "${range}" — expected <from>..<to>`);
  }
  return { fromCommit: parts[0], toCommit: parts[1] };
}

function parseArgs(argv: string[]): BenchmarkCliArgs {
  const args: BenchmarkCliArgs = { repo: "", range: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) {
      args.repo = argv[++i];
    } else if (argv[i] === "--range" && argv[i + 1]) {
      args.range = argv[++i];
    } else if (argv[i] === "--output" && argv[i + 1]) {
      args.output = argv[++i];
    }
  }
  return args;
}

export async function runBenchmarkCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (!args.repo) throw new Error("--repo <url> is required");
  if (!args.range) throw new Error("--range <from>..<to> is required");

  const { fromCommit, toCommit } = parseRange(args.range);
  const outputDir = args.output ?? path.join(process.cwd(), "benchmark-output");

  console.log(
    `[benchmark] repo=${args.repo} range=${args.range} output=${outputDir}`,
  );

  const records = await runBenchmark({
    repoUrl: args.repo,
    fromCommit,
    toCommit,
    outputDir,
  });

  console.log(`[benchmark] complete — ${records.length} commit(s) processed`);
  console.log(`[benchmark] results written to ${outputDir}/results/`);
}
