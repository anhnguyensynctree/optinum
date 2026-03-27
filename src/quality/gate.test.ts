import { strict as assert } from "assert";
import { test } from "node:test";
import * as path from "path";
import * as fs from "fs";
import {
  runQualityGate,
  mapFixtureTestToSynthesized,
  type SynthesisRunner,
} from "./gate";
import { formatGateReport } from "./gate-report";
import { loadFixtures } from "../fixtures/harness";
import type { SynthesizedTest } from "../types/pipeline";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures");

// Mock runner: returns valid SynthesizedTest[] from each fixture's expected-output.json
function buildPerfectRunner(): SynthesisRunner {
  return async (fixtureName: string) => {
    const fixtures = loadFixtures(FIXTURES_DIR);
    const entry = fixtures.find((f) => f.name === fixtureName);
    if (!entry?.output) return [];
    return entry.output.expectedTests.map((t) =>
      mapFixtureTestToSynthesized(t, fixtureName),
    );
  };
}

// Runner that omits all tests for specified fixtures (causes misses)
function buildPartialRunner(failFixtures: Set<string>): SynthesisRunner {
  const perfect = buildPerfectRunner();
  return async (fixtureName: string, expectedTestIds: string[]) => {
    if (failFixtures.has(fixtureName)) return [];
    return perfect(fixtureName, expectedTestIds);
  };
}

// Runner that returns structurally invalid tests (missing required fields)
function buildInvalidStructureRunner(): SynthesisRunner {
  return async (fixtureName: string) => {
    // Return objects missing required 'endpoint' and 'payload' fields
    return [
      { testId: "bad-001", caseType: "happy" } as unknown as SynthesizedTest,
    ];
  };
}

// Runner that includes extra testIds not in expectedTestIds (false positives)
function buildFalsePositiveRunner(count: number): SynthesisRunner {
  const perfect = buildPerfectRunner();
  let called = 0;
  return async (fixtureName: string, expectedTestIds: string[]) => {
    const base = await perfect(fixtureName, expectedTestIds);
    called++;
    if (called <= count) {
      // Add a test with an ID not in expected list
      base.push({
        testId: `fp-extra-${called}`,
        endpoint: `/${fixtureName}`,
        caseType: "edge",
        payload: {},
        expectedStatus: 200,
      });
    }
    return base;
  };
}

// --- Tests ---

test("all 15 fixtures pass — gate passes with perfect mock runner", async () => {
  const result = await runQualityGate(FIXTURES_DIR, buildPerfectRunner());

  assert.equal(result.perFixture.length, 15, "should process 15 fixtures");
  assert.equal(result.catchRate, 1.0, "catch rate should be 1.0");
  assert.equal(
    result.structuralValidity,
    1.0,
    "structural validity should be 1.0",
  );
  assert.equal(result.falsePositiveRate, 0, "false positive rate should be 0");
  assert.equal(result.passed, true, "gate should pass");
  assert.equal(result.failReasons.length, 0, "no fail reasons expected");

  for (const pf of result.perFixture) {
    assert.equal(pf.caught, true, `${pf.fixture} should be caught`);
    assert.equal(
      pf.structurallyValid,
      true,
      `${pf.fixture} should be structurally valid`,
    );
    assert.equal(
      pf.missedTestIds.length,
      0,
      `${pf.fixture} should have no missed testIds`,
    );
  }
});

test("4 failing fixtures (26%) causes gate to fail with correct failReasons", async () => {
  const failSet = new Set([
    "fixture-001-contract-change",
    "fixture-002-return-shape-change",
    "fixture-003-missing-auth-check",
    "fixture-004-auth-ownership",
  ]);

  const result = await runQualityGate(
    FIXTURES_DIR,
    buildPartialRunner(failSet),
  );

  // 11 caught out of 15 = 73.3% < 80%
  assert.equal(result.catchRate, 11 / 15, "catchRate should be 11/15");
  assert.equal(result.passed, false, "gate should fail");

  // Each failed fixture should appear in failReasons
  for (const fixtureName of failSet) {
    const hasReason = result.failReasons.some((r) => r.includes(fixtureName));
    assert.equal(hasReason, true, `failReasons should mention ${fixtureName}`);
  }

  // Failed fixtures should report their expected testIds as missed
  for (const pf of result.perFixture) {
    if (failSet.has(pf.fixture)) {
      assert.equal(pf.caught, false, `${pf.fixture} should not be caught`);
      assert.ok(
        pf.missedTestIds.length > 0,
        `${pf.fixture} should have missed testIds`,
      );
    }
  }

  // Overall summary fail reason should appear
  const hasCatchRateReason = result.failReasons.some(
    (r) => r.includes("catchRate") && r.includes("required"),
  );
  assert.equal(
    hasCatchRateReason,
    true,
    "failReasons should include catchRate summary",
  );
});

test("structurally invalid output causes structuralValidity < 1.0", async () => {
  const result = await runQualityGate(
    FIXTURES_DIR,
    buildInvalidStructureRunner(),
  );

  assert.ok(
    result.structuralValidity < 1.0,
    `structuralValidity ${result.structuralValidity} should be < 1.0`,
  );
  assert.equal(result.passed, false, "gate should fail");

  const hasStructReason = result.failReasons.some(
    (r) =>
      r.includes("structuralValidity") || r.includes("structural validation"),
  );
  assert.equal(
    hasStructReason,
    true,
    "failReasons should include structural validity info",
  );
});

test("formatGateReport produces non-empty string with fixture table", async () => {
  const result = await runQualityGate(FIXTURES_DIR, buildPerfectRunner());
  const report = formatGateReport(result);

  assert.ok(typeof report === "string", "report should be a string");
  assert.ok(report.length > 0, "report should be non-empty");

  // Check table headers are present
  assert.ok(report.includes("Fixture"), "report should contain Fixture column");
  assert.ok(report.includes("Caught"), "report should contain Caught column");
  assert.ok(report.includes("Valid"), "report should contain Valid column");

  // Check at least one fixture name appears
  assert.ok(
    report.includes("fixture-001-contract-change"),
    "report should list fixture-001",
  );

  // Check summary metrics appear
  assert.ok(report.includes("Catch Rate"), "report should include Catch Rate");
  assert.ok(
    report.includes("Structural Validity"),
    "report should include Structural Validity",
  );
});

test("formatGateReport shows fail reasons when gate fails", async () => {
  // Need 4+ failures to drop catch rate below 80% (4/15 = 73.3%)
  const failSet = new Set([
    "fixture-001-contract-change",
    "fixture-002-return-shape-change",
    "fixture-003-missing-auth-check",
    "fixture-004-auth-ownership",
  ]);
  const result = await runQualityGate(
    FIXTURES_DIR,
    buildPartialRunner(failSet),
  );
  const report = formatGateReport(result);

  assert.ok(report.includes("FAILED"), "report should say FAILED");
  assert.ok(
    report.includes("Fail Reasons"),
    "report should include Fail Reasons section",
  );
});

test("false positive detection: fixtures with extra tests are flagged", async () => {
  // 4 fixtures with false positives = 26.7% >= 20% threshold
  const result = await runQualityGate(
    FIXTURES_DIR,
    buildFalsePositiveRunner(4),
  );

  assert.ok(
    result.falsePositiveRate >= 0.2,
    `falsePositiveRate ${result.falsePositiveRate} should be >= 0.2`,
  );
  assert.equal(
    result.passed,
    false,
    "gate should fail due to false positive rate",
  );
});
