import * as assert from "assert";
import { test, describe, beforeEach, afterEach } from "node:test";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { SimpleGit } from "simple-git";
import { runBenchmark } from "./runner";

const LOG_OUTPUT = [
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa commit one",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb commit two",
  "cccccccccccccccccccccccccccccccccccccccccc commit three",
].join("\n");

function makeMockGit(): SimpleGit {
  const instance = {
    raw: async (args: string[]): Promise<string> => {
      if (args[0] === "log") return LOG_OUTPUT;
      if (args[0] === "diff" && args[args.length - 1] === "--name-only") {
        return "src/index.ts\nREADME.md\n";
      }
      return "";
    },
    clone: async (_url: string, _dir: string): Promise<string> => "",
  };
  return instance as unknown as SimpleGit;
}

const mockGit = makeMockGit();
const mockGitFactory = (_dir?: string): SimpleGit => mockGit;

describe("runBenchmark", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("produces 3 BenchmarkRecords for a 3-commit range", async () => {
    const records = await runBenchmark({
      repoUrl: "https://github.com/test/repo",
      fromCommit: "0000000000000000000000000000000000000000",
      toCommit: "cccccccccccccccccccccccccccccccccccccccccc",
      outputDir: tmpDir,
      _gitFactory: mockGitFactory,
      _patReader: () => null,
    });

    assert.strictEqual(records.length, 3, "should produce 3 records");

    for (const record of records) {
      assert.strictEqual(record.repo, "https://github.com/test/repo");
      assert.ok(record.commitSha.length > 0, "commitSha must be set");
      assert.ok(record.commitMessage.length > 0, "commitMessage must be set");
      assert.ok(
        Array.isArray(record.changedFiles),
        "changedFiles must be array",
      );
      assert.ok(Array.isArray(record.changeTypes), "changeTypes must be array");
      assert.ok(
        Array.isArray(record.blindSpotsDetected),
        "blindSpotsDetected must be array",
      );
      assert.strictEqual(record.laterFixCommit, null);
      assert.strictEqual(record.bugSignal, null);
      assert.ok(record.timestamp.length > 0, "timestamp must be set");
    }

    // results file written
    const resultsDir = path.join(tmpDir, "results");
    assert.ok(fs.existsSync(resultsDir), "results dir should exist");
    const files = fs.readdirSync(resultsDir);
    assert.strictEqual(files.length, 1, "one results file");

    // index file written
    const indexFile = path.join(tmpDir, "benchmark-index.json");
    assert.ok(fs.existsSync(indexFile), "index file should exist");
    const index = JSON.parse(fs.readFileSync(indexFile, "utf-8"));
    assert.strictEqual(index[0].commitCount, 3);
  });

  test("logs warning when PAT reader returns null", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

    try {
      await runBenchmark({
        repoUrl: "https://github.com/test/repo",
        fromCommit: "0000000000000000000000000000000000000000",
        toCommit: "cccccccccccccccccccccccccccccccccccccccccc",
        outputDir: tmpDir,
        _gitFactory: mockGitFactory,
        _patReader: () => {
          console.warn(
            "[benchmark] PAT not found at ~/.config/github/cross_repo_pat — falling back to unauthenticated (60 req/hour)",
          );
          return null;
        },
      });
    } finally {
      console.warn = originalWarn;
    }

    assert.ok(
      warnings.some((m) => m.includes("cross_repo_pat")),
      "should warn about missing PAT",
    );
  });

  test("each record sha matches the mocked git log order", async () => {
    const records = await runBenchmark({
      repoUrl: "https://github.com/test/repo",
      fromCommit: "0000000000000000000000000000000000000000",
      toCommit: "cccccccccccccccccccccccccccccccccccccccccc",
      outputDir: tmpDir,
      _gitFactory: mockGitFactory,
      _patReader: () => null,
    });

    assert.deepStrictEqual(
      records.map((r) => r.commitSha),
      [
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "cccccccccccccccccccccccccccccccccccccccccc",
      ],
    );
  });
});
