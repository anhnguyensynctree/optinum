import { test } from "node:test";
import { strict as assert } from "assert";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  checkFixtureStructure,
  runCompletenessCheck,
} from "./completeness-check";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures");

test("fixture-001 passes structure check", () => {
  const result = checkFixtureStructure(
    path.join(FIXTURES_DIR, "fixture-001-contract-change"),
    "fixture-001-contract-change",
  );
  assert.ok(result.hasBeforeDir, "Should have before/");
  assert.ok(result.hasAfterDir, "Should have after/");
  assert.ok(result.hasReadme, "Should have README.md");
  assert.ok(result.hasExpectedOutput, "Should have expected-output.json");
  assert.ok(result.expectedOutputValid, "expected-output.json should be valid");
  assert.ok(result.structurallyComplete, "Should be structurally complete");
});

test("fixture-001 has correct changeType", () => {
  const result = checkFixtureStructure(
    path.join(FIXTURES_DIR, "fixture-001-contract-change"),
    "fixture-001-contract-change",
  );
  assert.equal(result.changeType, "contract-change");
});

test("all 15 fixtures pass structure check", () => {
  const report = runCompletenessCheck(FIXTURES_DIR);
  assert.equal(
    report.totalFixtures,
    15,
    `Expected 15 fixtures, found ${report.totalFixtures}`,
  );

  if (report.incompleteFixtures.length > 0) {
    const msgs = report.incompleteFixtures
      .map((f) => {
        const missing: string[] = [];
        if (!f.hasBeforeDir) missing.push("before/");
        if (!f.hasAfterDir) missing.push("after/");
        if (!f.hasReadme) missing.push("README.md");
        if (!f.hasExpectedOutput) missing.push("expected-output.json");
        else if (!f.expectedOutputValid)
          missing.push("expected-output.json(invalid)");
        return `${f.name}: missing ${missing.join(",")}`;
      })
      .join("; ");
    assert.fail(`Incomplete fixtures: ${msgs}`);
  }
});

test("detects missing expected-output.json", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-incomplete-"));

  try {
    fs.mkdirSync(path.join(tmpDir, "before"));
    fs.mkdirSync(path.join(tmpDir, "after"));
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# test\n\ndesc");
    // No expected-output.json

    const result = checkFixtureStructure(tmpDir, "test-fixture");
    assert.ok(
      !result.hasExpectedOutput,
      "Should detect missing expected-output.json",
    );
    assert.ok(!result.structurallyComplete, "Should not be complete");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("completeness check passes for all current fixtures", () => {
  const report = runCompletenessCheck(FIXTURES_DIR);
  assert.ok(
    report.passed,
    `Completeness check failed: ${JSON.stringify(report.incompleteFixtures)}`,
  );
});
