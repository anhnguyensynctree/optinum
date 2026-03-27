import { test } from "node:test";
import { strict as assert } from "assert";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { analyzeGaps, GapReport } from "./gap-analyzer";
import { DiffBlastRadius } from "../types/pipeline";

const PROJECT_ROOT = path.join(__dirname, "../..");

test("returns GapReport array with testedDirectly for each function", () => {
  const blastRadius: DiffBlastRadius = {
    changed: [
      {
        filePath: path.join(PROJECT_ROOT, "src/catalog/catalog.ts"),
        functionName: "getCatalog",
        startLine: 1,
        endLine: 5,
      },
    ],
    dependents: [],
    dependencies: [],
  };

  const reports = analyzeGaps({ projectRoot: PROJECT_ROOT, blastRadius });
  assert.ok(Array.isArray(reports), "Should return array");
  assert.equal(reports.length, 1);
  assert.ok(typeof reports[0].testedDirectly === "boolean");
});

test("testedDirectly: true when function name appears in test file", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-gap-"));

  try {
    // Create source file
    const srcFile = path.join(tmpDir, "service.ts");
    fs.writeFileSync(srcFile, "export function createUser() {}\n");

    // Create test file mentioning createUser
    const testDir = path.join(tmpDir, "__tests__");
    fs.mkdirSync(testDir);
    fs.writeFileSync(
      path.join(testDir, "service.test.ts"),
      'import { createUser } from "../service";\ntest("createUser works", () => {});\n',
    );

    const blastRadius: DiffBlastRadius = {
      changed: [
        {
          filePath: srcFile,
          functionName: "createUser",
          startLine: 1,
          endLine: 1,
        },
      ],
      dependents: [],
      dependencies: [],
    };

    const reports = analyzeGaps({ projectRoot: tmpDir, blastRadius });
    assert.equal(reports.length, 1);
    assert.ok(
      reports[0].testedDirectly,
      "createUser should be detected as tested",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("testedDirectly: false when no test covers the function", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-gap-"));

  try {
    const srcFile = path.join(tmpDir, "service.ts");
    fs.writeFileSync(srcFile, "export function obscureUntestedFn() {}\n");

    // Test file that doesn't mention this function
    const testDir = path.join(tmpDir, "__tests__");
    fs.mkdirSync(testDir);
    fs.writeFileSync(
      path.join(testDir, "other.test.ts"),
      'test("something else", () => {});\n',
    );

    const blastRadius: DiffBlastRadius = {
      changed: [
        {
          filePath: srcFile,
          functionName: "obscureUntestedFn",
          startLine: 1,
          endLine: 1,
        },
      ],
      dependents: [],
      dependencies: [],
    };

    const reports = analyzeGaps({ projectRoot: tmpDir, blastRadius });
    assert.equal(reports.length, 1);
    assert.ok(
      !reports[0].testedDirectly,
      "obscureUntestedFn should not be detected as tested",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("no-tests-found warning when project has no test files", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-notests-"));

  try {
    const srcFile = path.join(tmpDir, "service.ts");
    fs.writeFileSync(srcFile, "export function doSomething() {}\n");

    const blastRadius: DiffBlastRadius = {
      changed: [
        {
          filePath: srcFile,
          functionName: "doSomething",
          startLine: 1,
          endLine: 1,
        },
      ],
      dependents: [],
      dependencies: [],
    };

    // Should not throw
    const reports = analyzeGaps({ projectRoot: tmpDir, blastRadius });
    assert.ok(Array.isArray(reports));
    assert.equal(reports[0].testedDirectly, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("blindSpotsWithoutCoverage includes idempotency for write-endpoint changeType", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-blind-"));

  try {
    const srcFile = path.join(tmpDir, "route.ts");
    fs.writeFileSync(srcFile, "export async function POST() {}\n");

    const blastRadius: DiffBlastRadius = {
      changed: [
        { filePath: srcFile, functionName: "POST", startLine: 1, endLine: 1 },
      ],
      dependents: [],
      dependencies: [],
    };

    const reports = analyzeGaps({
      projectRoot: tmpDir,
      blastRadius,
      changeTypes: ["new-write-endpoint"],
    });

    // No test files → idempotency should be in blind spots
    assert.ok(
      reports[0].blindSpotsWithoutCoverage.includes("idempotency"),
      `Expected idempotency in blind spots, got: ${reports[0].blindSpotsWithoutCoverage}`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});
