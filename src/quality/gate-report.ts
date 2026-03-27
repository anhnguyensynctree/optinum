import type { QualityGateResult } from "./gate";

const COL_FIXTURE = 42;
const COL_CAUGHT = 8;
const COL_VALID = 8;
const COL_EXPECTED = 10;
const COL_GENERATED = 11;

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len - 1) + " " : s.padEnd(len);
}

export function formatGateReport(result: QualityGateResult): string {
  const lines: string[] = [];

  lines.push("Quality Gate Report");
  lines.push("=".repeat(85));

  // Summary
  lines.push(
    `Catch Rate:          ${(result.catchRate * 100).toFixed(1)}%  (>= 80% required)`,
  );
  lines.push(
    `False Positive Rate: ${(result.falsePositiveRate * 100).toFixed(1)}%  (< 20% required)`,
  );
  lines.push(
    `Structural Validity: ${(result.structuralValidity * 100).toFixed(1)}%  (100% required)`,
  );
  lines.push(`Gate:                ${result.passed ? "PASSED" : "FAILED"}`);
  lines.push("");

  // Per-fixture table header
  lines.push(
    pad("Fixture", COL_FIXTURE) +
      pad("Caught", COL_CAUGHT) +
      pad("Valid", COL_VALID) +
      pad("Expected", COL_EXPECTED) +
      pad("Generated", COL_GENERATED) +
      "Missed",
  );
  lines.push("-".repeat(85));

  for (const f of result.perFixture) {
    const missed =
      f.missedTestIds.length > 0 ? f.missedTestIds.join(", ") : "-";
    lines.push(
      pad(f.fixture, COL_FIXTURE) +
        pad(f.caught ? "YES" : "NO", COL_CAUGHT) +
        pad(f.structurallyValid ? "YES" : "NO", COL_VALID) +
        pad(String(f.expectedTestCount), COL_EXPECTED) +
        pad(String(f.generatedTestCount), COL_GENERATED) +
        missed,
    );
  }

  lines.push("=".repeat(85));

  // Fail reasons
  if (!result.passed && result.failReasons.length > 0) {
    lines.push("");
    lines.push("Fail Reasons:");
    for (const r of result.failReasons) {
      lines.push(`  - ${r}`);
    }
  }

  return lines.join("\n");
}
