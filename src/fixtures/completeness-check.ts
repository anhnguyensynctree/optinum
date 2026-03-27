import * as fs from "fs";
import * as path from "path";
import { validateFixtureSchema } from "./harness";

export interface FixtureStructureResult {
  name: string;
  hasBeforeDir: boolean;
  hasAfterDir: boolean;
  hasReadme: boolean;
  hasExpectedOutput: boolean;
  expectedOutputValid: boolean;
  changeType: string | null;
  structurallyComplete: boolean;
}

export interface CompletenessReport {
  totalFixtures: number;
  completeCount: number;
  incompleteFixtures: FixtureStructureResult[];
  missingChangeTypes: string[];
  passed: boolean;
}

const REQUIRED_CHANGE_TYPE_CLASSES = [
  "contract-change",
  "new-auth-check",
  "input-trust",
  "new-write-endpoint",
  "cascade-change",
  "schema-migration",
] as const;

// Map required class names to actual expectedChangeType values used in fixtures.
// Multiple aliases may satisfy one required class.
const CHANGE_TYPE_ALIASES: Record<string, string[]> = {
  "contract-change": ["contract-change", "return-shape-change"],
  "new-auth-check": ["new-auth-check", "missing-auth-check", "auth-ownership"],
  "input-trust": ["input-trust"],
  "new-write-endpoint": ["new-write-endpoint", "input-trust"],
  "cascade-change": ["cascade-change", "cascade-missing"],
  "schema-migration": ["schema-migration", "migration-drift"],
};

export function checkFixtureStructure(
  fixtureDir: string,
  fixtureName: string,
): FixtureStructureResult {
  const beforePath = path.join(fixtureDir, "before");
  const afterPath = path.join(fixtureDir, "after");

  const hasBeforeDir =
    fs.existsSync(beforePath) && fs.statSync(beforePath).isDirectory();

  const hasAfterDir =
    fs.existsSync(afterPath) && fs.statSync(afterPath).isDirectory();

  const hasReadme = fs.existsSync(path.join(fixtureDir, "README.md"));

  const expectedOutputPath = path.join(fixtureDir, "expected-output.json");
  const hasExpectedOutput = fs.existsSync(expectedOutputPath);

  let expectedOutputValid = false;
  let changeType: string | null = null;

  if (hasExpectedOutput) {
    try {
      const raw: unknown = JSON.parse(
        fs.readFileSync(expectedOutputPath, "utf-8"),
      );
      expectedOutputValid = validateFixtureSchema(raw);
      if (expectedOutputValid) {
        const o = raw as Record<string, unknown>;
        changeType =
          typeof o["expectedChangeType"] === "string"
            ? o["expectedChangeType"]
            : null;
      }
    } catch {
      expectedOutputValid = false;
    }
  }

  const structurallyComplete =
    hasBeforeDir &&
    hasAfterDir &&
    hasReadme &&
    hasExpectedOutput &&
    expectedOutputValid;

  return {
    name: fixtureName,
    hasBeforeDir,
    hasAfterDir,
    hasReadme,
    hasExpectedOutput,
    expectedOutputValid,
    changeType,
    structurallyComplete,
  };
}

export function runCompletenessCheck(fixturesDir: string): CompletenessReport {
  if (!fs.existsSync(fixturesDir)) {
    return {
      totalFixtures: 0,
      completeCount: 0,
      incompleteFixtures: [],
      missingChangeTypes: [...REQUIRED_CHANGE_TYPE_CLASSES],
      passed: false,
    };
  }

  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
  const fixtureResults: FixtureStructureResult[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(fixturesDir, entry.name);
    fixtureResults.push(checkFixtureStructure(fullPath, entry.name));
  }

  const completeCount = fixtureResults.filter(
    (f) => f.structurallyComplete,
  ).length;
  const incompleteFixtures = fixtureResults.filter(
    (f) => !f.structurallyComplete,
  );

  const foundChangeTypes = new Set(
    fixtureResults
      .filter((f) => f.changeType !== null)
      .map((f) => f.changeType as string),
  );

  const missingChangeTypes = REQUIRED_CHANGE_TYPE_CLASSES.filter((required) => {
    const aliases = CHANGE_TYPE_ALIASES[required] ?? [required];
    return !aliases.some((alias) => foundChangeTypes.has(alias));
  });

  const passed = incompleteFixtures.length === 0;

  return {
    totalFixtures: fixtureResults.length,
    completeCount,
    incompleteFixtures,
    missingChangeTypes,
    passed,
  };
}

export function printCompletenessReport(report: CompletenessReport): void {
  console.log("\nFixture Catalog Completeness Check");
  console.log("=".repeat(70));
  console.log(`Total fixtures: ${report.totalFixtures}`);
  console.log(
    `Structurally complete: ${report.completeCount}/${report.totalFixtures}`,
  );

  if (report.incompleteFixtures.length > 0) {
    console.log("\nIncomplete fixtures:");
    for (const f of report.incompleteFixtures) {
      const missing: string[] = [];
      if (!f.hasBeforeDir) missing.push("before/");
      if (!f.hasAfterDir) missing.push("after/");
      if (!f.hasReadme) missing.push("README.md");
      if (!f.hasExpectedOutput) missing.push("expected-output.json");
      else if (!f.expectedOutputValid)
        missing.push("expected-output.json (invalid schema)");
      console.log(`  x ${f.name} — missing: ${missing.join(", ")}`);
    }
  }

  if (report.missingChangeTypes.length > 0) {
    console.log("\nMissing change type coverage:");
    for (const ct of report.missingChangeTypes) {
      console.log(`  x No fixture found for: ${ct}`);
    }
  } else {
    console.log("\nAll required change types covered");
  }

  console.log("\n" + (report.passed ? "PASSED" : "FAILED"));
}

// CLI entry
if (require.main === module) {
  const fixturesDir = process.argv[2] ?? path.join(__dirname, "../../fixtures");
  const report = runCompletenessCheck(fixturesDir);
  printCompletenessReport(report);
  process.exit(report.passed ? 0 : 1);
}
