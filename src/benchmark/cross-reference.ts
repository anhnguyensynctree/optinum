import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { BenchmarkRecord } from "../types/pipeline";

export interface CrossReferenceOptions {
  records: BenchmarkRecord[];
  repoPath: string;
  repoUrl: string;
  patPath?: string;
  // Injectable for testing
  _gitLog?: (repoPath: string, fromSha: string, count: number) => GitCommit[];
  _fetchFn?: (
    url: string,
    headers: Record<string, string>,
  ) => Promise<FetchResult>;
}

export interface GitCommit {
  sha: string;
  message: string;
  files: string[];
}

export interface FetchResult {
  status: number;
  body: unknown;
}

const DEFAULT_PAT_PATH = path.join(
  os.homedir(),
  ".config",
  "github",
  "cross_repo_pat",
);

function readPat(patPath: string): string | null {
  if (!fs.existsSync(patPath)) return null;
  return fs.readFileSync(patPath, "utf-8").trim() || null;
}

function defaultGitLog(
  repoPath: string,
  fromSha: string,
  count: number,
): GitCommit[] {
  try {
    const raw = execSync(
      `git -C "${repoPath}" log "${fromSha}^..HEAD" --format="%H %s" -${count + 1}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    const lines = raw.trim().split("\n").filter(Boolean);
    // Skip the first entry — that is fromSha itself
    const subsequent = lines.slice(1).slice(0, count);
    return subsequent.map((line) => {
      const spaceIdx = line.indexOf(" ");
      const sha = line.slice(0, spaceIdx);
      const message = line.slice(spaceIdx + 1);
      let files: string[] = [];
      try {
        const diff = execSync(
          `git -C "${repoPath}" diff-tree --no-commit-id -r --name-only "${sha}"`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
        );
        files = diff.trim().split("\n").filter(Boolean);
      } catch {
        // Non-fatal — leave files empty
      }
      return { sha, message, files };
    });
  } catch {
    return [];
  }
}

async function defaultFetch(
  url: string,
  headers: Record<string, string>,
): Promise<FetchResult> {
  const res = await fetch(url, { headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON response
  }
  return { status: res.status, body };
}

async function fetchWithBackoff(
  url: string,
  headers: Record<string, string>,
  fetchFn: (
    url: string,
    headers: Record<string, string>,
  ) => Promise<FetchResult>,
): Promise<FetchResult> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const result = await fetchFn(url, headers);
    if (result.status !== 429) return result;
    if (attempt < delays.length) {
      console.warn(
        `[cross-reference] GitHub rate limit hit (429). Retrying in ${delays[attempt]}ms (attempt ${attempt + 1}/3)`,
      );
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    } else {
      console.warn(
        "[cross-reference] GitHub rate limit hit (429) after 3 retries. Skipping GitHub query.",
      );
    }
  }
  // Return last result after exhausting retries — caller treats non-200 as no signal
  return { status: 429, body: null };
}

function parseOwnerRepo(
  repoUrl: string,
): { owner: string; repo: string } | null {
  try {
    const cleaned = repoUrl.replace(/\.git$/, "");
    const u = new URL(cleaned);
    const parts = u.pathname.replace(/^\//, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

function findLaterFixCommit(
  commits: GitCommit[],
  blindSpots: string[],
): string | null {
  if (blindSpots.length === 0) return null;
  for (const commit of commits) {
    const touches = commit.files.some((f) => blindSpots.includes(f));
    if (touches) return commit.sha;
  }
  return null;
}

async function queryBugSignal(
  functionName: string,
  owner: string,
  repo: string,
  pat: string | null,
  fetchFn: (
    url: string,
    headers: Record<string, string>,
  ) => Promise<FetchResult>,
): Promise<string | null> {
  const q = encodeURIComponent(`repo:${owner}/${repo} ${functionName}`);
  const url = `https://api.github.com/search/issues?q=${q}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (pat) headers["Authorization"] = `Bearer ${pat}`;

  const result = await fetchWithBackoff(url, headers, fetchFn);
  if (result.status === 200) {
    const data = result.body as { total_count?: number } | null;
    if (data && typeof data.total_count === "number" && data.total_count > 0) {
      return "issue-linked";
    }
  }
  return null;
}

export async function crossReference(
  options: CrossReferenceOptions,
): Promise<BenchmarkRecord[]> {
  const {
    records,
    repoPath,
    repoUrl,
    patPath = DEFAULT_PAT_PATH,
    _gitLog = defaultGitLog,
    _fetchFn = defaultFetch,
  } = options;

  const pat = readPat(patPath);
  const ownerRepo = parseOwnerRepo(repoUrl);

  return Promise.all(
    records.map(async (record): Promise<BenchmarkRecord> => {
      // Scan next 50 commits after this one for file overlap with blind spots
      const subsequentCommits = _gitLog(repoPath, record.commitSha, 50);
      const laterFixCommit = findLaterFixCommit(
        subsequentCommits,
        record.blindSpotsDetected,
      );

      // Query GitHub Issues for each blind spot function name
      let bugSignal: string | null = null;
      if (ownerRepo && record.blindSpotsDetected.length > 0) {
        // Use the first blind spot as the representative function name
        const functionName = path.basename(
          record.blindSpotsDetected[0],
          path.extname(record.blindSpotsDetected[0]),
        );
        bugSignal = await queryBugSignal(
          functionName,
          ownerRepo.owner,
          ownerRepo.repo,
          pat,
          _fetchFn,
        );
      }

      return {
        ...record,
        laterFixCommit: laterFixCommit ?? null,
        bugSignal: bugSignal ?? null,
      };
    }),
  );
}
