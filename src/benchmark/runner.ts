import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { BenchmarkRecord } from "../types/pipeline";
import { parseBlastRadius } from "../ast/ts-parser";
import { classifyChange } from "../classifier/change-classifier";

export interface RunBenchmarkOptions {
  repoUrl: string;
  fromCommit: string;
  toCommit: string;
  outputDir: string;
  // Injectable for testing — omit in production
  _gitFactory?: (dir?: string) => SimpleGit;
  _patReader?: () => string | null;
}

function repoSlug(repoUrl: string): string {
  return repoUrl
    .replace(/https?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/[^a-zA-Z0-9-]/g, "-");
}

function defaultPatReader(): string | null {
  const patPath = path.join(
    os.homedir(),
    ".config",
    "github",
    "cross_repo_pat",
  );
  if (!fs.existsSync(patPath)) {
    console.warn(
      "[benchmark] PAT not found at ~/.config/github/cross_repo_pat — falling back to unauthenticated (60 req/hour)",
    );
    return null;
  }
  return fs.readFileSync(patPath, "utf-8").trim();
}

function injectPatIntoUrl(repoUrl: string, pat: string): string {
  try {
    const u = new URL(repoUrl);
    u.username = pat;
    u.password = "x-oauth-basic";
    return u.toString();
  } catch {
    return repoUrl;
  }
}

async function ensureClone(
  repoUrl: string,
  cloneDir: string,
  pat: string | null,
  gitFactory: (dir?: string) => SimpleGit,
): Promise<SimpleGit> {
  const effectiveUrl = pat ? injectPatIntoUrl(repoUrl, pat) : repoUrl;
  if (!fs.existsSync(cloneDir)) {
    fs.mkdirSync(cloneDir, { recursive: true });
    await gitFactory().clone(effectiveUrl, cloneDir);
  }
  return gitFactory(cloneDir);
}

async function getCommitRange(
  git: SimpleGit,
  fromCommit: string,
  toCommit: string,
): Promise<Array<{ sha: string; message: string }>> {
  const log = await git.raw([
    "log",
    "--format=%H %s",
    `${fromCommit}..${toCommit}`,
  ]);
  return log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const spaceIdx = line.indexOf(" ");
      return {
        sha: line.slice(0, spaceIdx),
        message: line.slice(spaceIdx + 1),
      };
    });
}

async function getChangedFiles(
  git: SimpleGit,
  prevSha: string,
  sha: string,
): Promise<string[]> {
  const output = await git.raw(["diff", `${prevSha}...${sha}`, "--name-only"]);
  return output.trim().split("\n").filter(Boolean);
}

function extractBlindSpots(changedFiles: string[]): string[] {
  // Blind spots are TS files flagged by the blast radius pipeline
  return changedFiles.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

export async function runBenchmark(
  options: RunBenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const {
    repoUrl,
    fromCommit,
    toCommit,
    outputDir,
    _gitFactory = simpleGit,
    _patReader = defaultPatReader,
  } = options;

  const pat = _patReader();
  const slug = repoSlug(repoUrl);
  const cloneDir = path.join(os.tmpdir(), `optinum-benchmark-${slug}`);

  const git = await ensureClone(repoUrl, cloneDir, pat, _gitFactory);

  const commits = await getCommitRange(git, fromCommit, toCommit);

  const records: BenchmarkRecord[] = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // fromCommit is the predecessor for the earliest commit in the log
  const shaList = commits.map((c) => c.sha);

  for (let i = 0; i < commits.length; i++) {
    const { sha, message } = commits[i];
    const prevSha = i === commits.length - 1 ? fromCommit : shaList[i + 1];

    const changedFiles = await getChangedFiles(git, prevSha, sha);
    const tsFiles = changedFiles.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
    );

    let changeTypes = ["unknown"] as BenchmarkRecord["changeTypes"];

    if (tsFiles.length > 0) {
      try {
        const blastRadius = parseBlastRadius({
          projectRoot: cloneDir,
          changedFiles: tsFiles,
        });
        changeTypes = classifyChange(blastRadius);
      } catch {
        // non-TS repo or parse failure — leave as unknown
      }
    }

    const blindSpotsDetected = extractBlindSpots(changedFiles);

    records.push({
      repo: repoUrl,
      commitSha: sha,
      commitMessage: message,
      changedFiles,
      changeTypes,
      blindSpotsDetected,
      laterFixCommit: null,
      bugSignal: null,
      timestamp: new Date().toISOString(),
    });
  }

  // Write output
  const resultsDir = path.join(outputDir, "results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const outFile = path.join(resultsDir, `${slug}-${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(records, null, 2));

  // Update benchmark-index.json
  const indexFile = path.join(outputDir, "benchmark-index.json");
  const index: Array<{
    slug: string;
    timestamp: string;
    file: string;
    commitCount: number;
  }> = fs.existsSync(indexFile)
    ? JSON.parse(fs.readFileSync(indexFile, "utf-8"))
    : [];

  index.push({ slug, timestamp, file: outFile, commitCount: records.length });
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));

  return records;
}
