import { test } from "node:test";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  runMiddleLoop,
  type MiddleLoopSynthesisRunner,
  type StrykerReport,
} from "./middle-loop";
import type { SynthesizedTest } from "../types/pipeline";

// --- Helpers ---

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "optinum-middle-"));
}

function writeReport(dir: string, report: StrykerReport): string {
  const reportPath = path.join(dir, "mutation-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report));
  return reportPath;
}

function makeKilledReport(): StrykerReport {
  return {
    mutants: [
      {
        id: "m-001",
        mutatorName: "EqualityOperator",
        replacement: "!==",
        fileName: "src/api/route.ts",
        location: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 7 },
        },
        status: "Killed",
      },
      {
        id: "m-002",
        mutatorName: "BooleanLiteral",
        replacement: "false",
        fileName: "src/api/route.ts",
        location: {
          start: { line: 20, column: 3 },
          end: { line: 20, column: 7 },
        },
        status: "Killed",
      },
    ],
  };
}

function makeSurvivedReport(): StrykerReport {
  return {
    mutants: [
      {
        id: "m-010",
        mutatorName: "EqualityOperator",
        replacement: "!==",
        fileName: "src/api/route.ts",
        location: {
          start: { line: 15, column: 8 },
          end: { line: 15, column: 10 },
        },
        status: "Survived",
      },
    ],
  };
}

function makeMixedReport(): StrykerReport {
  return {
    mutants: [
      {
        id: "m-020",
        mutatorName: "EqualityOperator",
        replacement: "!==",
        fileName: "src/api/route.ts",
        location: {
          start: { line: 5, column: 4 },
          end: { line: 5, column: 6 },
        },
        status: "Killed",
      },
      {
        id: "m-021",
        mutatorName: "BooleanLiteral",
        replacement: "false",
        fileName: "src/api/route.ts",
        location: {
          start: { line: 10, column: 4 },
          end: { line: 10, column: 8 },
        },
        status: "Survived",
      },
    ],
  };
}

// --- Injectable runners ---

const killingSynthesisRunner: MiddleLoopSynthesisRunner = async () => {
  const tests: SynthesizedTest[] = [
    {
      testId: "t-synth-001",
      endpoint: "/api/test",
      caseType: "ai-blind-spot",
      payload: {},
      expectedStatus: 400,
      expectedResult: "FAIL",
    },
  ];
  return tests;
};

const survivingSynthesisRunner: MiddleLoopSynthesisRunner = async () => {
  const tests: SynthesizedTest[] = [
    {
      testId: "t-synth-002",
      endpoint: "/api/test",
      caseType: "happy",
      payload: {},
      expectedStatus: 200,
      expectedResult: "PASS",
    },
  ];
  return tests;
};

const emptySynthesisRunner: MiddleLoopSynthesisRunner = async () => [];

// --- Tests ---

test("all mutants killed by existing tests → score=1.0, survived=0, no regression", async () => {
  const dir = makeTempDir();
  try {
    const reportPath = writeReport(dir, makeKilledReport());
    const scoresPath = path.join(dir, "mutation-scores.json");
    fs.writeFileSync(scoresPath, "[]");

    const result = await runMiddleLoop({
      mutationReportPath: reportPath,
      synthesisRunner: emptySynthesisRunner,
      scoresPath,
      version: "1.0.0",
    });

    assert.equal(result.survived, 0);
    assert.equal(result.score, 1.0);
    assert.equal(result.regression, false);
    assert.equal(
      result.delta,
      null,
      "first run has no prior, delta must be null",
    );

    const saved = JSON.parse(fs.readFileSync(scoresPath, "utf8"));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].score, 1.0);
    assert.equal(saved[0].survived, 0);
    assert.equal(saved[0].version, "1.0.0");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("surviving mutant + killing synthesizer → mutant-killed path, score reflects kill", async () => {
  const dir = makeTempDir();
  try {
    const reportPath = writeReport(dir, makeSurvivedReport());
    const scoresPath = path.join(dir, "mutation-scores.json");
    fs.writeFileSync(scoresPath, "[]");

    const result = await runMiddleLoop({
      mutationReportPath: reportPath,
      synthesisRunner: killingSynthesisRunner,
      scoresPath,
      version: "1.1.0",
    });

    // 1 surviving mutant, synthesizer kills it → killed=1, survived=0
    assert.equal(result.survived, 0);
    assert.equal(result.killed, 1);
    assert.equal(result.score, 1.0);
    assert.equal(result.regression, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("surviving mutant + surviving synthesizer → mutant-survived path, score < 1", async () => {
  const dir = makeTempDir();
  try {
    const reportPath = writeReport(dir, makeSurvivedReport());
    const scoresPath = path.join(dir, "mutation-scores.json");
    fs.writeFileSync(scoresPath, "[]");

    const result = await runMiddleLoop({
      mutationReportPath: reportPath,
      synthesisRunner: survivingSynthesisRunner,
      scoresPath,
      version: "1.2.0",
    });

    // 1 surviving mutant, synthesizer also misses it → killed=0, survived=1
    assert.equal(result.survived, 1);
    assert.equal(result.killed, 0);
    assert.equal(result.score, 0.0);
    assert.equal(
      result.regression,
      false,
      "first run has no prior — no regression",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("score delta detection — regression alert when score drops", async () => {
  const dir = makeTempDir();
  try {
    const reportPath = writeReport(dir, makeSurvivedReport());
    const scoresPath = path.join(dir, "mutation-scores.json");

    // Seed a prior score of 1.0
    const prior = [
      {
        version: "1.0.0",
        date: "2026-01-01T00:00:00.000Z",
        killed: 10,
        survived: 0,
        score: 1.0,
        delta: null,
      },
    ];
    fs.writeFileSync(scoresPath, JSON.stringify(prior));

    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (
      s: string,
    ) => {
      stderrChunks.push(s);
      return true;
    };

    let result;
    try {
      result = await runMiddleLoop({
        mutationReportPath: reportPath,
        synthesisRunner: survivingSynthesisRunner,
        scoresPath,
        version: "1.3.0",
      });
    } finally {
      (process.stderr as unknown as { write: (s: string) => boolean }).write =
        origWrite as (s: string) => boolean;
    }

    assert.equal(result.regression, true, "expected regression=true");
    assert.ok(
      result.delta !== null && result.delta < 0,
      "delta must be negative",
    );

    const stderrOutput = stderrChunks.join("");
    assert.ok(
      stderrOutput.includes("MUTATION REGRESSION: score dropped from"),
      `expected regression log in stderr, got: ${stderrOutput}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("version re-baselining — delta is null when no prior scores exist", async () => {
  const dir = makeTempDir();
  try {
    const reportPath = writeReport(dir, makeMixedReport());
    const scoresPath = path.join(dir, "mutation-scores.json");
    fs.writeFileSync(scoresPath, "[]");

    const result = await runMiddleLoop({
      mutationReportPath: reportPath,
      synthesisRunner: killingSynthesisRunner,
      scoresPath,
      version: "2.0.0",
    });

    assert.equal(result.delta, null, "no prior run → delta must be null");
    assert.equal(
      result.regression,
      false,
      "no prior run → no regression possible",
    );

    const saved = JSON.parse(fs.readFileSync(scoresPath, "utf8"));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].delta, null);
    assert.equal(saved[0].version, "2.0.0");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("empty mutant set — no-op, score=1.0, no regression", async () => {
  const dir = makeTempDir();
  try {
    const emptyReport: StrykerReport = { mutants: [] };
    const reportPath = writeReport(dir, emptyReport);
    const scoresPath = path.join(dir, "mutation-scores.json");
    fs.writeFileSync(scoresPath, "[]");

    const result = await runMiddleLoop({
      mutationReportPath: reportPath,
      synthesisRunner: emptySynthesisRunner,
      scoresPath,
      version: "1.0.0",
    });

    assert.equal(result.killed, 0);
    assert.equal(result.survived, 0);
    assert.equal(result.score, 1.0);
    assert.equal(result.regression, false);
    assert.equal(result.delta, null);

    const saved = JSON.parse(fs.readFileSync(scoresPath, "utf8"));
    assert.equal(saved.length, 1, "should still append a record");
    assert.equal(saved[0].score, 1.0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("files-map report format is parsed correctly", async () => {
  const dir = makeTempDir();
  try {
    const filesReport: StrykerReport = {
      files: {
        "src/api/route.ts": {
          mutants: [
            {
              id: "f-001",
              mutatorName: "EqualityOperator",
              replacement: "!==",
              fileName: "src/api/route.ts",
              location: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 3 },
              },
              status: "Survived",
            },
          ],
        },
      },
    };
    const reportPath = writeReport(dir, filesReport);
    const scoresPath = path.join(dir, "mutation-scores.json");
    fs.writeFileSync(scoresPath, "[]");

    const result = await runMiddleLoop({
      mutationReportPath: reportPath,
      synthesisRunner: killingSynthesisRunner,
      scoresPath,
      version: "1.0.0",
    });

    // 1 survived mutant killed by synthesizer
    assert.equal(result.killed, 1);
    assert.equal(result.survived, 0);
    assert.equal(result.score, 1.0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
