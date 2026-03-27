import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crossReference, GitCommit, FetchResult } from "./cross-reference";
import { BenchmarkRecord } from "../types/pipeline";

// Stable base record for tests
function makeRecord(overrides: Partial<BenchmarkRecord> = {}): BenchmarkRecord {
  return {
    repo: "https://github.com/owner/repo",
    commitSha: "abc123",
    commitMessage: "feat: add feature",
    changedFiles: ["src/utils/parser.ts", "src/api/routes.ts"],
    changeTypes: ["unknown"],
    blindSpotsDetected: ["src/utils/parser.ts"],
    laterFixCommit: null,
    bugSignal: null,
    timestamp: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// No-op git log — returns empty
const emptyGitLog = (
  _repoPath: string,
  _sha: string,
  _count: number,
): GitCommit[] => [];

// No-op fetch — returns no issues
const emptyFetch = async (
  _url: string,
  _headers: Record<string, string>,
): Promise<FetchResult> => ({
  status: 200,
  body: { total_count: 0, items: [] },
});

describe("crossReference", () => {
  it("sets laterFixCommit when a subsequent commit touches a blind spot file", async () => {
    const record = makeRecord();

    const gitLog = (
      _repoPath: string,
      _sha: string,
      _count: number,
    ): GitCommit[] => [
      {
        sha: "fix001",
        message: "fix: patch parser bug",
        files: ["src/utils/parser.ts"],
      },
      {
        sha: "feat002",
        message: "feat: add unrelated thing",
        files: ["src/other.ts"],
      },
    ];

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: gitLog,
      _fetchFn: emptyFetch,
    });

    assert.equal(results[0].laterFixCommit, "fix001");
    assert.equal(results[0].bugSignal, null);
  });

  it("sets bugSignal to issue-linked when GitHub returns issues", async () => {
    const record = makeRecord();

    const fetchFn = async (
      url: string,
      _headers: Record<string, string>,
    ): Promise<FetchResult> => {
      if (url.includes("api.github.com/search/issues")) {
        return {
          status: 200,
          body: { total_count: 3, items: [{ number: 1 }] },
        };
      }
      return { status: 200, body: { total_count: 0, items: [] } };
    };

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: emptyGitLog,
      _fetchFn: fetchFn,
    });

    assert.equal(results[0].bugSignal, "issue-linked");
    assert.equal(results[0].laterFixCommit, null);
  });

  it("sets both laterFixCommit and bugSignal when both signals found", async () => {
    const record = makeRecord();

    const gitLog = (): GitCommit[] => [
      {
        sha: "def456",
        message: "fix: hotfix parser",
        files: ["src/utils/parser.ts"],
      },
    ];

    const fetchFn = async (): Promise<FetchResult> => ({
      status: 200,
      body: { total_count: 1, items: [{ number: 5 }] },
    });

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: gitLog,
      _fetchFn: fetchFn,
    });

    assert.equal(results[0].laterFixCommit, "def456");
    assert.equal(results[0].bugSignal, "issue-linked");
  });

  it("sets nulls when no subsequent commit touches blind spots and no GitHub issue", async () => {
    const record = makeRecord();

    const gitLog = (): GitCommit[] => [
      { sha: "unrelated1", message: "chore: cleanup", files: ["README.md"] },
    ];

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: gitLog,
      _fetchFn: emptyFetch,
    });

    assert.equal(results[0].laterFixCommit, null);
    assert.equal(results[0].bugSignal, null);
  });

  it("triggers exponential backoff on 429 and returns null bugSignal after max retries", async () => {
    const record = makeRecord();
    const callTimestamps: number[] = [];
    let callCount = 0;

    const fetchFn = async (): Promise<FetchResult> => {
      callTimestamps.push(Date.now());
      callCount++;
      return { status: 429, body: null };
    };

    // Override setTimeout to make test fast but still count invocations
    const originalSetTimeout = global.setTimeout;
    let backoffCount = 0;
    // We patch the delay via a fast mock at module level isn't possible in Node test runner
    // Instead we run with real timers — but use very short delays by monkey-patching
    // Inject a minimal delay mock: wrap Promise resolve
    const realSetTimeout = global.setTimeout;

    // Reduce actual delays: patch the module's internal setTimeout via the global
    const fastSetTimeout = (
      fn: (...args: unknown[]) => void,
      _delay?: number,
    ) => {
      backoffCount++;
      return realSetTimeout(fn, 1); // 1ms for test speed
    };
    // @ts-expect-error monkey-patching for test
    global.setTimeout = fastSetTimeout;

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: emptyGitLog,
      _fetchFn: fetchFn,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).setTimeout = originalSetTimeout;

    // Should have called fetch 4 times: 1 initial + 3 retries
    assert.equal(callCount, 4);
    // backoff pauses happened 3 times
    assert.equal(backoffCount, 3);
    // After exhausting retries, bugSignal must be null (429 is not treated as "found")
    assert.equal(results[0].bugSignal, null);
  });

  it("laterFixCommit is null when no blind spots on record", async () => {
    const record = makeRecord({ blindSpotsDetected: [] });

    const gitLog = (): GitCommit[] => [
      {
        sha: "sha999",
        message: "fix: something",
        files: ["src/utils/parser.ts"],
      },
    ];

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: gitLog,
      _fetchFn: emptyFetch,
    });

    assert.equal(results[0].laterFixCommit, null);
    assert.equal(results[0].bugSignal, null);
  });

  it("handles records with no later commits gracefully", async () => {
    const record = makeRecord();

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: emptyGitLog,
      _fetchFn: emptyFetch,
    });

    assert.equal(results[0].laterFixCommit, null);
    assert.equal(results[0].bugSignal, null);
  });

  it("processes multiple records independently", async () => {
    const record1 = makeRecord({
      commitSha: "sha001",
      blindSpotsDetected: ["src/a.ts"],
    });
    const record2 = makeRecord({
      commitSha: "sha002",
      blindSpotsDetected: ["src/b.ts"],
    });

    const gitLog = (_repoPath: string, sha: string): GitCommit[] => {
      if (sha === "sha001") {
        return [{ sha: "fix_a", message: "fix a", files: ["src/a.ts"] }];
      }
      return [];
    };

    const results = await crossReference({
      records: [record1, record2],
      repoPath: "/fake/repo",
      repoUrl: "https://github.com/owner/repo",
      _gitLog: gitLog,
      _fetchFn: emptyFetch,
    });

    assert.equal(results[0].laterFixCommit, "fix_a");
    assert.equal(results[1].laterFixCommit, null);
  });

  it("skips GitHub query when repoUrl cannot be parsed", async () => {
    const record = makeRecord();
    let fetchCalled = false;

    const fetchFn = async (): Promise<FetchResult> => {
      fetchCalled = true;
      return { status: 200, body: { total_count: 1, items: [] } };
    };

    const results = await crossReference({
      records: [record],
      repoPath: "/fake/repo",
      repoUrl: "not-a-valid-url",
      _gitLog: emptyGitLog,
      _fetchFn: fetchFn,
    });

    assert.equal(fetchCalled, false);
    assert.equal(results[0].bugSignal, null);
  });
});
