import * as fs from "fs";
import * as path from "path";

export interface FixtureTestEntry {
  testId: string;
  caseType: string;
  description: string;
  expectedResult?: "PASS" | "FAIL";
  blindSpotPattern?: string;
}

export interface FixtureBlastRadius {
  changed: string[];
  dependents: string[];
  dependencies: string[];
}

export interface FixtureExpectedOutput {
  fixture: string;
  description: string;
  diffFile: string;
  schemaSource: string;
  expectedBlastRadius: FixtureBlastRadius;
  expectedChangeType: string;
  expectedContractDelta?: {
    removed?: string[];
    added?: string[];
  };
  expectedTests: FixtureTestEntry[];
  passCriteria: {
    upwardDependentsFound?: string[];
    testsGenerated?: string[];
    testsCThatMustFail?: string[];
    bugCaughtVia: string;
    missingArtifact?: string;
  };
  failCriteria: string[];
}

export function validateFixtureSchema(
  output: unknown,
): output is FixtureExpectedOutput {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  const required = [
    "fixture",
    "description",
    "diffFile",
    "expectedBlastRadius",
    "expectedChangeType",
    "expectedTests",
    "passCriteria",
    "failCriteria",
  ];
  for (const field of required) {
    if (!(field in o)) return false;
  }
  if (!Array.isArray(o.expectedTests as unknown[])) return false;
  if (!Array.isArray(o.failCriteria as unknown[])) return false;
  return true;
}

export function loadFixtures(
  fixturesDir: string,
): Array<{
  name: string;
  output: FixtureExpectedOutput | null;
  error?: string;
}> {
  if (!fs.existsSync(fixturesDir)) return [];
  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
  const results: Array<{
    name: string;
    output: FixtureExpectedOutput | null;
    error?: string;
  }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const outputPath = path.join(
      fixturesDir,
      entry.name,
      "expected-output.json",
    );
    if (!fs.existsSync(outputPath)) {
      results.push({
        name: entry.name,
        output: null,
        error: "expected-output.json not found",
      });
      continue;
    }
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      if (!validateFixtureSchema(raw)) {
        results.push({
          name: entry.name,
          output: null,
          error: "schema validation failed",
        });
      } else {
        results.push({ name: entry.name, output: raw });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        name: entry.name,
        output: null,
        error: `parse error: ${msg}`,
      });
    }
  }
  return results;
}

export function countBlindSpotTests(output: FixtureExpectedOutput): number {
  return output.expectedTests.filter((t) => t.caseType === "ai-blind-spot")
    .length;
}

export function countMustFailTests(output: FixtureExpectedOutput): number {
  return output.expectedTests.filter((t) => t.expectedResult === "FAIL").length;
}

export function reportFixtures(fixturesDir: string): void {
  const fixtures = loadFixtures(fixturesDir);
  console.log("\nFixture Validation Report");
  console.log("=".repeat(80));
  console.log(
    "Fixture".padEnd(40) +
      "Valid".padEnd(8) +
      "Tests".padEnd(8) +
      "BlindSpot".padEnd(12) +
      "MustFail",
  );
  console.log("-".repeat(80));
  for (const f of fixtures) {
    if (!f.output) {
      console.log(f.name.padEnd(40) + "NO".padEnd(8) + `(${f.error})`);
    } else {
      const total = f.output.expectedTests.length;
      const blindSpot = countBlindSpotTests(f.output);
      const mustFail = countMustFailTests(f.output);
      console.log(
        f.name.padEnd(40) +
          "YES".padEnd(8) +
          String(total).padEnd(8) +
          String(blindSpot).padEnd(12) +
          String(mustFail),
      );
    }
  }
  console.log("=".repeat(80));
  const valid = fixtures.filter((f) => f.output !== null).length;
  console.log(`\nTotal: ${fixtures.length} fixtures, ${valid} valid`);
}

// CLI entry point
if (require.main === module) {
  const fixturesDir = process.argv[2] || path.join(__dirname, "../../fixtures");
  reportFixtures(fixturesDir);
}
