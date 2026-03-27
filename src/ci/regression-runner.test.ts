import { test } from "node:test";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runRegressionSuite } from "./regression-runner";
import type { RegressionRunners } from "./regression-runner";
import type { SynthesizedTest } from "../types/pipeline";
import type {
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../types/pipeline";

// --- Fixture factory ---

function makeFixtureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const beforeDir = path.join(dir, "before");
  const afterDir = path.join(dir, "after");
  fs.mkdirSync(beforeDir, { recursive: true });
  fs.mkdirSync(afterDir, { recursive: true });
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
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));
  makeFixtureDir(path.join(tmpBase, "fixture-001-contract-change"));
  return tmpBase;
}

// --- Runners ---

// Gate synthesis runner that "catches" all expected tests (produces matching testIds)
const catchAllGateRunner = async (
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

// Gate synthesis runner that catches nothing
const catchNoneGateRunner = async (
  _fixtureName: string,
  _expectedTestIds: string[],
): Promise<SynthesizedTest[]> => {
  return [];
};

// Outer loop runners that always pass all MRs
const passingOuterLoopRunners = {
  synthesisRunner: async (
    blastRadius: DiffBlastRadius,
    contracts: EndpointContract[],
    _changeTypes: ChangeType[],
  ): Promise<SynthesizedTest[]> => {
    return blastRadius.changed.map((fn, i) => ({
      testId: `${fn.functionName}-${i}`,
      endpoint: contracts[0]?.endpoint ?? "/test",
      caseType: "ai-blind-spot" as const,
      payload: {},
      expectedStatus: 200,
    }));
  },
  classifyRunner: (_br: DiffBlastRadius): ChangeType[] => ["contract-change"],
  blastRadiusRunner: async (br: DiffBlastRadius) => br,
};

// Outer loop runners that always violate MR-1
const violatingOuterLoopRunners = {
  ...passingOuterLoopRunners,
  synthesisRunner: (() => {
    let callCount = 0;
    return async (
      _br: DiffBlastRadius,
      contracts: EndpointContract[],
    ): Promise<SynthesizedTest[]> => {
      callCount++;
      return [
        {
          testId: `t-${callCount}`,
          endpoint: contracts[0]?.endpoint ?? "/test",
          caseType: "ai-blind-spot" as const,
          payload: {},
          expectedStatus: 200,
          blindSpotPattern: callCount === 1 ? "pattern-a" : "pattern-b",
        },
      ];
    };
  })(),
};

// --- Tests ---

test("both quality gate and outer loop pass → RegressionResult.passed is true", async () => {
  const fixturesDir = createTempFixturesDir();
  try {
    const runners: RegressionRunners = {
      gateSynthesisRunner: catchAllGateRunner,
      outerLoopRunners: passingOuterLoopRunners,
    };

    const result = await runRegressionSuite(fixturesDir, runners);

    assert.equal(
      result.passed,
      true,
      `expected passed=true, summary: ${result.summary}`,
    );
    assert.equal(result.qualityGate.passed, true);
    assert.equal(result.outerLoop.allPassed, true);
    assert.ok(
      result.summary.includes("CI gate: PASS"),
      `expected CI gate: PASS in summary, got: ${result.summary}`,
    );
    assert.ok(
      result.summary.includes("Optinum is validating its own pipeline"),
      `expected brand line in summary, got: ${result.summary}`,
    );
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});

test("quality gate fails → RegressionResult.passed is false with correct summary", async () => {
  const fixturesDir = createTempFixturesDir();
  try {
    const runners: RegressionRunners = {
      gateSynthesisRunner: catchNoneGateRunner,
      outerLoopRunners: passingOuterLoopRunners,
    };

    const result = await runRegressionSuite(fixturesDir, runners);

    assert.equal(
      result.passed,
      false,
      `expected passed=false, summary: ${result.summary}`,
    );
    assert.equal(result.qualityGate.passed, false);
    assert.ok(
      result.summary.includes("CI gate: FAIL"),
      `expected CI gate: FAIL in summary, got: ${result.summary}`,
    );
    assert.ok(
      result.summary.includes("Optinum is validating its own pipeline"),
      `expected brand line in summary, got: ${result.summary}`,
    );
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});

test("outer loop violation → RegressionResult.passed is false", async () => {
  const fixturesDir = createTempFixturesDir();
  // Need 2 fixtures for MR-5 to run pairwise; 1 fixture is enough for MR-1
  makeFixtureDir(path.join(fixturesDir, "fixture-002-auth-check"));
  try {
    const runners: RegressionRunners = {
      gateSynthesisRunner: catchAllGateRunner,
      outerLoopRunners: violatingOuterLoopRunners,
    };

    const result = await runRegressionSuite(fixturesDir, runners);

    assert.equal(
      result.passed,
      false,
      `expected passed=false, summary: ${result.summary}`,
    );
    assert.equal(result.outerLoop.allPassed, false);
    assert.ok(
      result.outerLoop.violations.length > 0,
      "expected at least one outer loop violation",
    );
    assert.ok(
      result.summary.includes("CI gate: FAIL"),
      `expected CI gate: FAIL in summary, got: ${result.summary}`,
    );
    assert.ok(
      result.summary.includes("Optinum is validating its own pipeline"),
      `expected brand line in summary, got: ${result.summary}`,
    );
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});
