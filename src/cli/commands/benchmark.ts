import * as fs from "fs";
import * as path from "path";
import { runBenchmark } from "../../benchmark/runner";

interface BenchmarkCliArgs {
  repo: string;
  range: string;
  output?: string;
  seed: boolean;
}

interface SeedRepo {
  slug: string;
  repoUrl: string;
  language: string;
  description: string;
  suggestedRange: string;
}

const SEED_REPOS_PATH = path.join(
  path.dirname(path.dirname(path.dirname(__dirname))),
  "benchmark",
  "seed-repos.json",
);

function parseRange(range: string): { fromCommit: string; toCommit: string } {
  const parts = range.split("..");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid range format "${range}" — expected <from>..<to>`);
  }
  return { fromCommit: parts[0], toCommit: parts[1] };
}

function parseArgs(argv: string[]): BenchmarkCliArgs {
  const args: BenchmarkCliArgs = { repo: "", range: "", seed: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) {
      args.repo = argv[++i];
    } else if (argv[i] === "--range" && argv[i + 1]) {
      args.range = argv[++i];
    } else if (argv[i] === "--output" && argv[i + 1]) {
      args.output = argv[++i];
    } else if (argv[i] === "--seed") {
      args.seed = true;
    }
  }
  return args;
}

function loadSeedRepos(seedPath: string): SeedRepo[] {
  if (!fs.existsSync(seedPath)) {
    throw new Error(`seed-repos.json not found at ${seedPath}`);
  }
  const raw = fs.readFileSync(seedPath, "utf-8");
  return JSON.parse(raw) as SeedRepo[];
}

async function runSeedBenchmark(outputDir: string): Promise<void> {
  const repos = loadSeedRepos(SEED_REPOS_PATH);
  console.log(`[benchmark] --seed mode: running ${repos.length} seed repos`);

  for (const repo of repos) {
    const { fromCommit, toCommit } = parseRange(repo.suggestedRange);
    console.log(
      `[benchmark] [${repo.slug}] repo=${repo.repoUrl} range=${repo.suggestedRange}`,
    );
    const records = await runBenchmark({
      repoUrl: repo.repoUrl,
      fromCommit,
      toCommit,
      outputDir,
    });
    console.log(
      `[benchmark] [${repo.slug}] complete — ${records.length} commit(s) processed`,
    );
  }

  console.log(
    `[benchmark] seed run complete — results written to ${outputDir}/results/`,
  );
}

export async function runBenchmarkCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const outputDir = args.output ?? path.join(process.cwd(), "benchmark-output");

  if (args.seed) {
    await runSeedBenchmark(outputDir);
    return;
  }

  if (!args.repo) throw new Error("--repo <url> is required");
  if (!args.range) throw new Error("--range <from>..<to> is required");

  const { fromCommit, toCommit } = parseRange(args.range);

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
