import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { test, describe } from "node:test";
import { runTestCommand, type TestCommandFlags } from "./commands/test";
import type {
  SynthesizeInput,
  SynthesizeResult,
} from "../synthesizer/synthesizer";

const FIXTURE_001 = path.resolve(
  __dirname,
  "../../fixtures/fixture-001-contract-change",
);

const MOCK_TESTS = [
  {
    testId: "001-A",
    endpoint: "/api/questionnaire",
    caseType: "happy" as const,
    payload: {
      mode: "quick",
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
    },
    expectedStatus: 200,
  },
  {
    testId: "001-B",
    endpoint: "/api/questionnaire",
    caseType: "edge" as const,
    payload: { type: "quick", userId: "bad" },
    expectedStatus: 400,
  },
  {
    testId: "001-C",
    endpoint: "/api/questionnaire",
    caseType: "ai-blind-spot" as const,
    payload: { mode: "quick", sessionId: "abc" },
    expectedStatus: 400,
    blindSpotPattern: "contract-change",
  },
  {
    testId: "001-D",
    endpoint: "/api/questionnaire",
    caseType: "ai-blind-spot" as const,
    payload: { mode: "full", sessionId: "xyz" },
    expectedStatus: 400,
    blindSpotPattern: "contract-change",
  },
];

const mockSynthesize = async (
  _input: SynthesizeInput,
): Promise<SynthesizeResult> => ({
  tests: MOCK_TESTS,
  error: null,
});

const emptySynthesize = async (
  _input: SynthesizeInput,
): Promise<SynthesizeResult> => ({
  tests: [],
  error: null,
});

// Capture stdout/stderr during a call; traps process.exit as well
function captureOutput(fn: () => Promise<void>): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolve) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit.bind(process);

    let exitCode: number | null = null;
    let settled = false;

    const restore = () => {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      (process as NodeJS.Process).exit = origExit;
    };

    const settle = (code: number | null) => {
      if (settled) return;
      settled = true;
      exitCode = code;
      restore();
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        exitCode,
      });
    };

    (process.stdout as NodeJS.WriteStream).write = (chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    };
    (process.stderr as NodeJS.WriteStream).write = (chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    };
    (process as NodeJS.Process).exit = (code?: number) => {
      settle(code ?? 0);
      throw new Error(`__exit__${code ?? 0}`);
    };

    fn()
      .then(() => settle(null))
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.startsWith("__exit__")) {
          return;
        }
        settle(1);
      });
  });
}

describe("optinum test command", () => {
  describe("dry-run — prints without writing", () => {
    test("prints test output and writes nothing to disk", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));

      const flags: TestCommandFlags = {
        diff: FIXTURE_001,
        output: tmpDir,
        "dry-run": true,
        runner: "jest",
        llm: "cli",
        _synthesize: mockSynthesize,
      };

      const { stdout } = await captureOutput(() => runTestCommand(flags));

      const files = fs.readdirSync(tmpDir);
      assert.strictEqual(files.length, 0, "no files written in dry-run");
      assert.ok(stdout.includes("describe("), "stdout contains describe block");
      assert.ok(
        stdout.includes("tests generated"),
        "stdout contains summary line",
      );

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe("--runner vitest — uses vitest import", () => {
    test("generated file contains vitest import", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));

      const flags: TestCommandFlags = {
        diff: FIXTURE_001,
        output: tmpDir,
        runner: "vitest",
        llm: "cli",
        _synthesize: mockSynthesize,
      };

      await captureOutput(() => runTestCommand(flags));

      const outFile = path.join(tmpDir, "generated.test.ts");
      const content = fs.readFileSync(outFile, "utf8");
      assert.ok(content.includes('from "vitest"'), "contains vitest import");

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe("fixture-001 — produces 4 tests", () => {
    test("writes generated.test.ts with 4 it() blocks", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));

      const flags: TestCommandFlags = {
        diff: FIXTURE_001,
        output: tmpDir,
        runner: "jest",
        llm: "cli",
        _synthesize: mockSynthesize,
      };

      const { stdout } = await captureOutput(() => runTestCommand(flags));

      const outFile = path.join(tmpDir, "generated.test.ts");
      assert.ok(fs.existsSync(outFile), "generated.test.ts exists");

      const content = fs.readFileSync(outFile, "utf8");
      const itMatches = content.match(/\bit\(/g);
      assert.strictEqual(itMatches?.length ?? 0, 4, "4 it() blocks in output");

      assert.ok(stdout.includes("4 tests generated"), "summary shows 4 tests");

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe("missing diff — exits 1", () => {
    test("exits with code 1 when --diff points to nonexistent path", async () => {
      const flags: TestCommandFlags = {
        diff: "/tmp/__nonexistent_optinum_diff__",
        runner: "jest",
        llm: "cli",
        _synthesize: emptySynthesize,
      };

      const { exitCode } = await captureOutput(() => runTestCommand(flags));

      assert.strictEqual(exitCode, 1, "exits with code 1");
    });
  });
});
