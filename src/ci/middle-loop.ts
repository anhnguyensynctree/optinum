/**
 * Middle loop — weekly StrykerJS adversarial mutation testing.
 *
 * Reads a StrykerJS JSON mutation report, feeds each surviving mutant to
 * the TestSynthesizer as a synthetic diff input, and tracks whether the
 * synthesizer would generate tests that detect the mutation. Appends a
 * scored record to benchmark/mutation-scores.json and logs a regression
 * warning when the mutation score drops.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
  SynthesizedTest,
} from "../types/pipeline";

// --- Types ---

/** A mutant entry from the StrykerJS JSON report. */
export interface StrykerMutant {
  id: string;
  mutatorName: string;
  replacement: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  fileName: string;
  status:
    | "Killed"
    | "Survived"
    | "NoCoverage"
    | "Ignored"
    | "CompileError"
    | "RuntimeError"
    | "Timeout";
}

/** StrykerJS JSON report shape (files map or flat array). */
export interface StrykerReport {
  files?: Record<string, { mutants: StrykerMutant[] }>;
  mutants?: StrykerMutant[];
}

/** A single mutation score record persisted to benchmark/mutation-scores.json. */
export interface MutationScoreRecord {
  version: string;
  date: string;
  killed: number;
  survived: number;
  score: number;
  delta: number | null;
}

/** Result returned from runMiddleLoop. */
export interface MiddleLoopResult {
  killed: number;
  survived: number;
  score: number;
  delta: number | null;
  regression: boolean;
}

/** Injectable synthesis runner — mirrors the pattern used by inner-loop. */
export type MiddleLoopSynthesisRunner = (
  blastRadius: DiffBlastRadius,
  contracts: EndpointContract[],
  changeTypes: ChangeType[],
) => Promise<SynthesizedTest[]>;

export interface MiddleLoopOptions {
  mutationReportPath: string;
  synthesisRunner?: MiddleLoopSynthesisRunner;
  scoresPath?: string;
  version?: string;
}

// --- Constants ---

const DEFAULT_SCORES_PATH = path.resolve(
  __dirname,
  "../../benchmark/mutation-scores.json",
);

// Mutators that map to contract-change semantics
const CONTRACT_CHANGE_MUTATORS = new Set([
  "ConditionalExpression",
  "EqualityOperator",
  "BooleanLiteral",
  "LogicalOperator",
]);

// --- Helpers ---

function extractMutants(report: StrykerReport): StrykerMutant[] {
  if (Array.isArray(report.mutants)) {
    return report.mutants;
  }
  if (report.files && typeof report.files === "object") {
    const all: StrykerMutant[] = [];
    for (const fileEntry of Object.values(report.files)) {
      if (Array.isArray(fileEntry.mutants)) {
        all.push(...fileEntry.mutants);
      }
    }
    return all;
  }
  return [];
}

function mutantToBlastRadius(mutant: StrykerMutant): DiffBlastRadius {
  const functionName = `${mutant.mutatorName}_line${mutant.location.start.line}`;
  return {
    changed: [
      {
        filePath: mutant.fileName,
        functionName,
        startLine: mutant.location.start.line,
        endLine: mutant.location.end.line,
      },
    ],
    dependents: [],
    dependencies: [],
  };
}

function mutantToContracts(mutant: StrykerMutant): EndpointContract[] {
  return [
    {
      endpoint: `/mutant/${mutant.id}`,
      method: "POST",
      fields: [
        {
          name: "mutatorName",
          type: "string",
          required: true,
        },
        {
          name: "replacement",
          type: "string",
          required: true,
        },
      ],
      source: "unknown",
    },
  ];
}

function mutantToChangeTypes(mutant: StrykerMutant): ChangeType[] {
  if (CONTRACT_CHANGE_MUTATORS.has(mutant.mutatorName)) {
    return ["contract-change"];
  }
  return ["unknown"];
}

function isSynthesizerKill(tests: SynthesizedTest[]): boolean {
  // Synthesizer "kills" the mutant if it generated at least one test expecting FAIL
  return tests.some((t) => t.expectedResult === "FAIL");
}

function loadScores(scoresPath: string): MutationScoreRecord[] {
  if (!fs.existsSync(scoresPath)) {
    return [];
  }
  const raw = fs.readFileSync(scoresPath, "utf8").trim();
  if (!raw || raw === "[]") {
    return [];
  }
  try {
    return JSON.parse(raw) as MutationScoreRecord[];
  } catch {
    return [];
  }
}

function appendScore(scoresPath: string, record: MutationScoreRecord): void {
  const existing = loadScores(scoresPath);
  existing.push(record);
  const dir = path.dirname(scoresPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(scoresPath, JSON.stringify(existing, null, 2));
}

// Default synthesisRunner — real implementation, only used in production runs
async function defaultSynthesisRunner(
  blastRadius: DiffBlastRadius,
  contracts: EndpointContract[],
  changeTypes: ChangeType[],
): Promise<SynthesizedTest[]> {
  const { synthesizeTests } = await import("../synthesizer/synthesizer");
  const result = await synthesizeTests({
    blastRadius,
    contracts,
    changeTypes,
    mode: "api",
  });
  return result.tests;
}

// --- Runner ---

export async function runMiddleLoop(
  options: MiddleLoopOptions,
): Promise<MiddleLoopResult> {
  const {
    mutationReportPath,
    synthesisRunner = defaultSynthesisRunner,
    scoresPath = DEFAULT_SCORES_PATH,
    version = "unknown",
  } = options;

  // Load and parse StrykerJS report
  const rawReport = fs.readFileSync(mutationReportPath, "utf8");
  const report: StrykerReport = JSON.parse(rawReport);
  const allMutants = extractMutants(report);

  // Only process surviving mutants — killed ones are already caught by tests
  const survivingMutants = allMutants.filter((m) => m.status === "Survived");

  if (survivingMutants.length === 0) {
    // No survivors — perfect score from the actual mutant set
    const totalRelevant = allMutants.filter(
      (m) => m.status === "Killed" || m.status === "Survived",
    ).length;

    const killed = totalRelevant;
    const survived = 0;
    const score = totalRelevant === 0 ? 1.0 : 1.0;

    const priorScores = loadScores(scoresPath);
    const previous =
      priorScores.length > 0 ? priorScores[priorScores.length - 1] : null;
    const delta = previous !== null ? score - previous.score : null;
    const regression = delta !== null && delta < 0;

    if (regression) {
      process.stderr.write(
        `MUTATION REGRESSION: score dropped from ${previous!.score.toFixed(4)} to ${score.toFixed(4)}\n`,
      );
    }

    const record: MutationScoreRecord = {
      version,
      date: new Date().toISOString(),
      killed,
      survived,
      score,
      delta,
    };
    appendScore(scoresPath, record);

    return { killed, survived, score, delta, regression };
  }

  // For each surviving mutant, ask the synthesizer if it can generate a killing test
  let synthKilled = 0;
  let synthSurvived = 0;

  for (const mutant of survivingMutants) {
    const blastRadius = mutantToBlastRadius(mutant);
    const contracts = mutantToContracts(mutant);
    const changeTypes = mutantToChangeTypes(mutant);

    let tests: SynthesizedTest[];
    try {
      tests = await synthesisRunner(blastRadius, contracts, changeTypes);
    } catch {
      tests = [];
    }

    if (isSynthesizerKill(tests)) {
      synthKilled++;
    } else {
      synthSurvived++;
    }
  }

  // Total killed = mutants killed by existing tests + mutants synthesizer would catch
  const testKilled = allMutants.filter((m) => m.status === "Killed").length;
  const totalKilled = testKilled + synthKilled;
  const totalSurvived = synthSurvived;
  const totalRelevant = totalKilled + totalSurvived;
  const score = totalRelevant === 0 ? 1.0 : totalKilled / totalRelevant;

  const priorScores = loadScores(scoresPath);
  const previous =
    priorScores.length > 0 ? priorScores[priorScores.length - 1] : null;
  const delta = previous !== null ? score - previous.score : null;
  const regression = delta !== null && delta < 0;

  if (regression) {
    process.stderr.write(
      `MUTATION REGRESSION: score dropped from ${previous!.score.toFixed(4)} to ${score.toFixed(4)}\n`,
    );
  }

  const record: MutationScoreRecord = {
    version,
    date: new Date().toISOString(),
    killed: totalKilled,
    survived: totalSurvived,
    score,
    delta,
  };
  appendScore(scoresPath, record);

  return {
    killed: totalKilled,
    survived: totalSurvived,
    score,
    delta,
    regression,
  };
}
