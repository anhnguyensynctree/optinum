/**
 * Inner loop — per-PR CI validation.
 *
 * Uses the quality gate to validate the current branch's changes against
 * the fixture harness. Skips docs-only PRs. Blocks merge on catch rate
 * regression below 80%.
 */

import * as path from "path";
import {
  runQualityGate,
  type QualityGateResult,
  type SynthesisRunner,
} from "../quality/gate";

// --- Types ---

export interface InnerLoopResult {
  passed: boolean;
  catchRate: number;
  skipped: boolean;
  skipReason?: string;
  summary: string;
  qualityGate?: QualityGateResult;
}

export type InnerLoopSynthesisRunner = SynthesisRunner;

// --- Constants ---

const CATCH_RATE_MIN = 0.8;

// File extensions that are considered non-code (docs/config only)
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

// --- Helpers ---

function hasCodeChanges(prFiles: string[]): boolean {
  return prFiles.some((f) => CODE_EXTENSIONS.test(f));
}

// --- Runner ---

export async function runInnerLoop(
  fixturesDir: string,
  prFiles: string[],
  synthesisRunner?: InnerLoopSynthesisRunner,
): Promise<InnerLoopResult> {
  if (!hasCodeChanges(prFiles)) {
    return {
      passed: true,
      catchRate: 0,
      skipped: true,
      skipReason: "No code changes — inner loop skipped",
      summary: "Inner loop skipped: no TypeScript/JavaScript files changed.",
    };
  }

  const resolvedDir = path.resolve(fixturesDir);
  const qualityGate = await runQualityGate(resolvedDir, synthesisRunner);

  const catchRate = qualityGate.catchRate;
  const catchPct = (catchRate * 100).toFixed(1);
  const thresholdPct = (CATCH_RATE_MIN * 100).toFixed(1);

  const passed = catchRate >= CATCH_RATE_MIN;

  let summary: string;
  if (passed) {
    summary = [
      `Inner loop CI gate: PASS`,
      `Catch rate: ${catchPct}% (threshold: ${thresholdPct}%)`,
      `Structural validity: ${(qualityGate.structuralValidity * 100).toFixed(1)}%`,
    ].join("\n");
  } else {
    summary = [
      `Inner loop CI gate: FAIL`,
      `Inner loop regression: catch rate dropped from ${thresholdPct}% to ${catchPct}%`,
      `Structural validity: ${(qualityGate.structuralValidity * 100).toFixed(1)}%`,
      qualityGate.failReasons.length > 0
        ? `Reasons:\n${qualityGate.failReasons.map((r) => `  - ${r}`).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    passed,
    catchRate,
    skipped: false,
    summary,
    qualityGate,
  };
}
