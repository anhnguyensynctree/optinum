/**
 * Outer loop: runs all 5 metamorphic relations against provided fixtures.
 * A violation is when an MR expected equivalence but got different output.
 * No real API calls — uses injectable mocked runners.
 */

import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../types/pipeline";
import { runMR as runMR1 } from "./metamorphic-relations/mr1-noop";
import { runMR as runMR2 } from "./metamorphic-relations/mr2-rename";
import { runMR as runMR3 } from "./metamorphic-relations/mr3-duplicate";
import { runMR as runMR4 } from "./metamorphic-relations/mr4-comment";
import { runMR as runMR5 } from "./metamorphic-relations/mr5-equivalent";

export interface OuterLoopFixture {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
}

export interface MRViolation {
  mrId: string;
  fixture: string;
  message: string;
}

export interface OuterLoopReport {
  allPassed: boolean;
  violations: MRViolation[];
}

export type SynthesisRunner = (
  blastRadius: DiffBlastRadius,
  contracts: EndpointContract[],
  changeTypes: ChangeType[],
) => Promise<SynthesizedTest[]>;

export type ClassifyRunner = (blastRadius: DiffBlastRadius) => ChangeType[];

export type BlastRadiusRunner = (
  blastRadius: DiffBlastRadius,
  contracts: EndpointContract[],
  changeTypes: ChangeType[],
) => Promise<DiffBlastRadius>;

export interface OuterLoopRunners {
  synthesisRunner: SynthesisRunner;
  classifyRunner: ClassifyRunner;
  blastRadiusRunner: BlastRadiusRunner;
}

export async function runOuterLoop(
  fixtures: OuterLoopFixture[],
  runners: OuterLoopRunners,
): Promise<OuterLoopReport> {
  const violations: MRViolation[] = [];

  for (let i = 0; i < fixtures.length; i++) {
    const fix = fixtures[i];
    const fixtureName = `fixture-${i}`;

    // MR-1: no-op refactor does not change blind spot patterns
    const mr1Result = await runMR1({
      blastRadius: fix.blastRadius,
      contracts: fix.contracts,
      changeTypes: fix.changeTypes,
      runner: runners.synthesisRunner,
    });
    if (!mr1Result.passed) {
      violations.push({
        mrId: "MR-1",
        fixture: fixtureName,
        message: mr1Result.violation ?? "MR-1 failed",
      });
    }

    // MR-2: variable rename does not change classifyChange output
    const mr2Result = await runMR2({
      blastRadius: fix.blastRadius,
      contracts: fix.contracts,
      changeTypes: fix.changeTypes,
      classifyRunner: runners.classifyRunner,
    });
    if (!mr2Result.passed) {
      violations.push({
        mrId: "MR-2",
        fixture: fixtureName,
        message: mr2Result.violation ?? "MR-2 failed",
      });
    }

    // MR-3: duplicate unchanged function does not expand blast radius dependents
    const mr3Result = await runMR3({
      blastRadius: fix.blastRadius,
      contracts: fix.contracts,
      changeTypes: fix.changeTypes,
      runner: runners.blastRadiusRunner,
    });
    if (!mr3Result.passed) {
      violations.push({
        mrId: "MR-3",
        fixture: fixtureName,
        message: mr3Result.violation ?? "MR-3 failed",
      });
    }

    // MR-4: adding comment block produces structurally equivalent tests
    const mr4Result = await runMR4({
      blastRadius: fix.blastRadius,
      contracts: fix.contracts,
      changeTypes: fix.changeTypes,
      runner: runners.synthesisRunner,
    });
    if (!mr4Result.passed) {
      violations.push({
        mrId: "MR-4",
        fixture: fixtureName,
        message: mr4Result.violation ?? "MR-4 failed",
      });
    }
  }

  // MR-5: run pairwise across fixtures with same schema
  for (let i = 0; i < fixtures.length - 1; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const mr5Result = await runMR5({
        fixtureA: fixtures[i],
        fixtureB: fixtures[j],
        runner: runners.synthesisRunner,
      });
      if (!mr5Result.passed) {
        violations.push({
          mrId: "MR-5",
          fixture: `fixture-${i}:fixture-${j}`,
          message: mr5Result.violation ?? "MR-5 failed",
        });
      }
    }
  }

  return {
    allPassed: violations.length === 0,
    violations,
  };
}
