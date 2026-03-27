import { test } from "node:test";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runInnerLoop } from "./inner-loop";
import type { InnerLoopSynthesisRunner } from "./inner-loop";
import type { SynthesizedTest } from "../types/pipeline";

// --- Fixture factory ---

function makeFixtureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "before"), { recursive: true });
  fs.mkdirSync(path.join(dir, "after"), { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), "# fixture");

  const expectedOutput = {
    fixture: path.basename(dir),
    description: "test fixture",
    diffFile: "after/src/api/route.ts",
    schemaSource: "zod",
    expectedBlastRadius: { changed: [], dependents: [], dependencies: [] },
    expectedChangeType: "contract-change",
    expectedTests: [
      {
        testId: "t-001",
        caseType: "ai-blind-spot",
        description: "blind spot test",
        expectedResult: "FAIL",
      },
    ],
    passCriteria: { bugCaughtVia: "blast-radius" },
    failCriteria: [],
  };

  fs.writeFileSync(
    path.join(dir, "expected-output.json"),
    JSON.stringify(expectedOutput, null, 2),
  );
}

function createTempFixturesDir(): string {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-inner-"));
  makeFixtureDir(path.join(tmpBase, "fixture-001-contract-change"));
  return tmpBase;
}

// --- Injectable runners ---

const catchAllRunner: InnerLoopSynthesisRunner = async (
  _fixtureName: string,
  expectedTestIds: string[],
): Promise<SynthesizedTest[]> => {
  return expectedTestIds.map((id) => ({
    testId: id,
    endpoint: "/api/test",
    caseType: "ai-blind-spot" as const,
    payload: {},
    expectedStatus: 200,
  }));
};

const catchNoneRunner: InnerLoopSynthesisRunner = async (
  _fixtureName: string,
  _expectedTestIds: string[],
): Promise<SynthesizedTest[]> => {
  return [];
};

// --- Tests ---

test("docs-only PR (no TS files) → skipped with correct skipReason", async () => {
  const fixturesDir = createTempFixturesDir();
  try {
    const prFiles = [
      "README.md",
      "docs/guide.md",
      ".github/workflows/ci.yml",
      "package.json",
    ];
    const result = await runInnerLoop(fixturesDir, prFiles, catchAllRunner);

    assert.equal(result.skipped, true, "expected skipped=true");
    assert.equal(result.passed, true, "skipped runs should not block merge");
    assert.equal(
      result.skipReason,
      "No code changes — inner loop skipped",
      `unexpected skipReason: ${result.skipReason}`,
    );
    assert.equal(
      result.qualityGate,
      undefined,
      "qualityGate should be absent when skipped",
    );
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});

test("code PR with .ts file → inner loop runs, passes when catch rate >= 80%", async () => {
  const fixturesDir = createTempFixturesDir();
  try {
    const prFiles = ["src/ci/inner-loop.ts", "README.md"];
    const result = await runInnerLoop(fixturesDir, prFiles, catchAllRunner);

    assert.equal(result.skipped, false, "expected skipped=false for code PR");
    assert.equal(
      result.passed,
      true,
      `expected passed=true, summary: ${result.summary}`,
    );
    assert.ok(
      result.catchRate >= 0.8,
      `expected catchRate >= 0.8, got ${result.catchRate}`,
    );
    assert.ok(
      result.summary.includes("Inner loop CI gate: PASS"),
      `expected PASS in summary, got: ${result.summary}`,
    );
    assert.ok(
      result.qualityGate !== undefined,
      "qualityGate should be present",
    );
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});

test("catch rate < 80% → regression detected, passed=false, summary includes regression message", async () => {
  const fixturesDir = createTempFixturesDir();
  try {
    const prFiles = ["src/ci/inner-loop.ts"];
    const result = await runInnerLoop(fixturesDir, prFiles, catchNoneRunner);

    assert.equal(result.skipped, false, "expected skipped=false");
    assert.equal(
      result.passed,
      false,
      `expected passed=false, summary: ${result.summary}`,
    );
    assert.ok(
      result.catchRate < 0.8,
      `expected catchRate < 0.8, got ${result.catchRate}`,
    );
    assert.ok(
      result.summary.includes("Inner loop regression: catch rate dropped from"),
      `expected regression message in summary, got: ${result.summary}`,
    );
    assert.ok(
      result.summary.includes("Inner loop CI gate: FAIL"),
      `expected FAIL in summary, got: ${result.summary}`,
    );
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});

test("passing run returns correct shape with qualityGate present and no skipReason", async () => {
  const fixturesDir = createTempFixturesDir();
  try {
    const prFiles = ["src/api/route.ts", "src/types/pipeline.ts"];
    const result = await runInnerLoop(fixturesDir, prFiles, catchAllRunner);

    assert.equal(result.skipped, false);
    assert.equal(result.passed, true);
    assert.equal(
      result.skipReason,
      undefined,
      "skipReason should be absent on non-skipped run",
    );
    assert.ok(result.qualityGate !== undefined, "qualityGate must be present");
    assert.ok(
      typeof result.catchRate === "number",
      "catchRate must be a number",
    );
    assert.ok(result.summary.length > 0, "summary must not be empty");
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});
