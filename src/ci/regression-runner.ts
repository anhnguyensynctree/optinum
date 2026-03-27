/**
 * Regression suite runner — combines the quality gate and outer loop MRs into
 * a single result used by CI. Gates on catch rate >= 80% and structural
 * validity == 100%.
 */

import * as path from "path";
import { loadFixtures } from "../fixtures/harness";
import {
  runQualityGate,
  type QualityGateResult,
  type SynthesisRunner as GateSynthesisRunner,
} from "../quality/gate";
import {
  runOuterLoop,
  type OuterLoopReport,
  type OuterLoopFixture,
  type OuterLoopRunners,
} from "./outer-loop";
import type { DiffBlastRadius, EndpointContract } from "../types/pipeline";

export interface RegressionResult {
  qualityGate: QualityGateResult;
  outerLoop: OuterLoopReport;
  passed: boolean;
  summary: string;
}

export interface RegressionRunners {
  /** Optional synthesis runner injected into the quality gate (for testing). */
  gateSynthesisRunner?: GateSynthesisRunner;
  /** Optional runners injected into the outer loop (for testing). */
  outerLoopRunners?: OuterLoopRunners;
}

function buildDefaultOuterLoopRunners(): OuterLoopRunners {
  return {
    synthesisRunner: async (blastRadius, contracts, changeTypes) => {
      return blastRadius.changed.map((fn, i) => ({
        testId: `synth-${fn.functionName}-${i}`,
        endpoint: contracts[0]?.endpoint ?? "/unknown",
        caseType: "ai-blind-spot" as const,
        payload: {},
        expectedStatus: 200,
        blindSpotPattern: changeTypes[0] ?? "unknown",
      }));
    },
    classifyRunner: (blastRadius) => {
      if (blastRadius.changed.length === 0) return ["unknown" as const];
      return ["contract-change" as const];
    },
    blastRadiusRunner: async (blastRadius) => blastRadius,
  };
}

function buildOuterLoopFixtures(fixturesDir: string): OuterLoopFixture[] {
  const loaded = loadFixtures(fixturesDir);
  const fixtures: OuterLoopFixture[] = [];

  const VALID_CHANGE_TYPES = [
    "contract-change",
    "new-write-endpoint",
    "new-delete-operation",
    "new-auth-check",
    "schema-migration",
    "cascade-change",
    "unknown",
  ] as const;
  type ValidChangeType = (typeof VALID_CHANGE_TYPES)[number];

  for (const f of loaded) {
    if (!f.output) continue;

    const blastRadius: DiffBlastRadius = {
      changed: f.output.expectedBlastRadius.changed.map((name, i) => ({
        filePath: `src/${name}.ts`,
        functionName: name,
        startLine: i * 10,
        endLine: i * 10 + 9,
      })),
      dependents: f.output.expectedBlastRadius.dependents.map((name, i) => ({
        filePath: `src/${name}.ts`,
        functionName: name,
        startLine: i * 10,
        endLine: i * 10 + 9,
      })),
      dependencies: f.output.expectedBlastRadius.dependencies.map(
        (name, i) => ({
          filePath: `src/${name}.ts`,
          functionName: name,
          startLine: i * 10,
          endLine: i * 10 + 9,
        }),
      ),
    };

    const contracts: EndpointContract[] = f.output.expectedTests
      .filter((t) => t.caseType === "ai-blind-spot")
      .slice(0, 1)
      .map((t) => ({
        endpoint: `/${t.testId}`,
        method: "POST" as const,
        fields: [],
        source: "unknown" as const,
      }));

    if (contracts.length === 0) {
      contracts.push({
        endpoint: "/fixture",
        method: "POST" as const,
        fields: [],
        source: "unknown" as const,
      });
    }

    const rawChangeType = f.output.expectedChangeType;
    const safeChangeType: ValidChangeType = (
      VALID_CHANGE_TYPES as readonly string[]
    ).includes(rawChangeType)
      ? (rawChangeType as ValidChangeType)
      : "unknown";

    fixtures.push({ blastRadius, contracts, changeTypes: [safeChangeType] });
  }

  return fixtures;
}

export async function runRegressionSuite(
  fixturesDir: string,
  runners?: RegressionRunners,
): Promise<RegressionResult> {
  const resolvedDir = path.resolve(fixturesDir);

  const qualityGate = await runQualityGate(
    resolvedDir,
    runners?.gateSynthesisRunner,
  );

  const outerLoopFixtures = buildOuterLoopFixtures(resolvedDir);
  const effectiveOuterRunners =
    runners?.outerLoopRunners ?? buildDefaultOuterLoopRunners();
  const outerLoop = await runOuterLoop(
    outerLoopFixtures,
    effectiveOuterRunners,
  );

  const passed = qualityGate.passed && outerLoop.allPassed;

  const ciStatus = passed ? "PASS" : "FAIL";
  const gateStatus = qualityGate.passed ? "PASS" : "FAIL";
  const outerStatus = outerLoop.allPassed ? "PASS" : "FAIL";

  const catchPct = (qualityGate.catchRate * 100).toFixed(1);
  const structPct = (qualityGate.structuralValidity * 100).toFixed(1);

  const violationLines =
    outerLoop.violations.length > 0
      ? outerLoop.violations
          .map((v) => `  - ${v.mrId} [${v.fixture}]: ${v.message}`)
          .join("\n")
      : "  (none)";

  const summary = [
    `Optinum is validating its own pipeline — CI gate: ${ciStatus}`,
    `Quality gate: ${gateStatus} | catch rate: ${catchPct}% | structural validity: ${structPct}%`,
    `Outer loop MRs: ${outerStatus} | violations: ${outerLoop.violations.length}`,
    outerLoop.violations.length > 0 ? `Violations:\n${violationLines}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { qualityGate, outerLoop, passed, summary };
}
