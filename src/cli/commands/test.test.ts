import assert from "node:assert/strict";
import { test, describe } from "node:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { SynthesizedTest } from "../../types/pipeline";
import {
  extractPyFilesFromDiffFile,
  extractTsFilesFromDiffFile,
  detectEcosystem,
  renderPytestFile,
} from "./test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTempDiff(content: string): string {
  const tmp = path.join(os.tmpdir(), `optinum-test-${Date.now()}.diff`);
  fs.writeFileSync(tmp, content, "utf8");
  return tmp;
}

// ---------------------------------------------------------------------------
// extractPyFilesFromDiffFile
// ---------------------------------------------------------------------------

describe("extractPyFilesFromDiffFile", () => {
  test("extracts .py paths from unified diff headers", () => {
    const diff = [
      "diff --git a/src/users.py b/src/users.py",
      "--- a/src/users.py",
      "+++ b/src/users.py",
      "@@ -1,3 +1,5 @@",
      " pass",
    ].join("\n");

    const tmp = writeTempDiff(diff);
    const files = extractPyFilesFromDiffFile(tmp);
    fs.unlinkSync(tmp);

    assert.deepEqual(files, ["src/users.py"]);
  });

  test("skips test files (*_test.py and test_*.py)", () => {
    const diff = [
      "--- a/src/users_test.py",
      "+++ b/src/users_test.py",
      "--- a/src/users.py",
      "+++ b/src/users.py",
      "--- a/test_orders.py",
      "+++ b/test_orders.py",
    ].join("\n");

    const tmp = writeTempDiff(diff);
    const files = extractPyFilesFromDiffFile(tmp);
    fs.unlinkSync(tmp);

    assert.deepEqual(files, ["src/users.py"]);
  });

  test("deduplicates --- and +++ headers for the same file", () => {
    const diff = ["--- a/app/main.py", "+++ b/app/main.py"].join("\n");

    const tmp = writeTempDiff(diff);
    const files = extractPyFilesFromDiffFile(tmp);
    fs.unlinkSync(tmp);

    assert.equal(files.length, 1);
    assert.equal(files[0], "app/main.py");
  });

  test("returns empty array for diff with no .py files", () => {
    const diff = ["--- a/src/index.ts", "+++ b/src/index.ts"].join("\n");

    const tmp = writeTempDiff(diff);
    const files = extractPyFilesFromDiffFile(tmp);
    fs.unlinkSync(tmp);

    assert.deepEqual(files, []);
  });
});

// ---------------------------------------------------------------------------
// extractTsFilesFromDiffFile (regression — existing behaviour)
// ---------------------------------------------------------------------------

describe("extractTsFilesFromDiffFile", () => {
  test("extracts .ts paths and skips .test.ts", () => {
    const diff = [
      "--- a/src/handler.ts",
      "+++ b/src/handler.ts",
      "--- a/src/handler.test.ts",
      "+++ b/src/handler.test.ts",
    ].join("\n");

    const tmp = writeTempDiff(diff);
    const files = extractTsFilesFromDiffFile(tmp);
    fs.unlinkSync(tmp);

    assert.deepEqual(files, ["src/handler.ts"]);
  });
});

// ---------------------------------------------------------------------------
// detectEcosystem
// ---------------------------------------------------------------------------

describe("detectEcosystem", () => {
  test('returns "python" when any file ends with .py', () => {
    assert.equal(detectEcosystem(["src/users.py", "src/utils.ts"]), "python");
  });

  test('returns "python" for pure python list', () => {
    assert.equal(detectEcosystem(["app/main.py", "app/models.py"]), "python");
  });

  test('returns "typescript" for pure typescript list', () => {
    assert.equal(
      detectEcosystem(["src/route.ts", "src/handler.tsx"]),
      "typescript",
    );
  });

  test('returns "typescript" for empty list', () => {
    assert.equal(detectEcosystem([]), "typescript");
  });
});

// ---------------------------------------------------------------------------
// renderPytestFile
// ---------------------------------------------------------------------------

const SAMPLE_TESTS: SynthesizedTest[] = [
  {
    testId: "t001",
    endpoint: "/api/users",
    caseType: "happy",
    payload: { name: "Alice" },
    expectedStatus: 200,
  },
  {
    testId: "t002",
    endpoint: "/api/users",
    caseType: "edge",
    payload: {},
    expectedStatus: 422,
  },
  {
    testId: "t003",
    endpoint: "/api/users",
    caseType: "ai-blind-spot",
    payload: { name: "" },
    expectedStatus: 400,
    blindSpotPattern: "empty-name-bypass",
  },
];

describe("renderPytestFile", () => {
  test("output contains httpx import", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    assert.ok(out.includes("import httpx"), "missing httpx import");
  });

  test("output contains pytest import", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    assert.ok(out.includes("import pytest"), "missing pytest import");
  });

  test("output contains def test_ functions", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    const defs = out.match(/^def test_/gm) ?? [];
    assert.equal(defs.length, SAMPLE_TESTS.length);
  });

  test("output contains assert resp.status_code", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    assert.ok(
      out.includes("assert resp.status_code"),
      "missing status code assertion",
    );
  });

  test("uses httpx.post for tests with payload", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    assert.ok(out.includes("httpx.post("), "missing httpx.post call");
  });

  test("uses httpx.get for tests without payload", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    assert.ok(out.includes("httpx.get("), "missing httpx.get call");
  });

  test("includes blind spot comment for ai-blind-spot tests", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    assert.ok(
      out.includes("# empty-name-bypass"),
      "missing blind spot comment",
    );
  });

  test("function names use testId and caseType", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    assert.ok(out.includes("def test_t001_happy_"), "missing t001 happy fn");
    assert.ok(out.includes("def test_t002_edge_"), "missing t002 edge fn");
  });

  test("returns empty header-only string for empty tests array", () => {
    const out = renderPytestFile([]);
    assert.ok(out.includes("import httpx"));
    assert.ok(!out.includes("def test_"));
  });

  test("stays under 100 lines for 3-test input", () => {
    const out = renderPytestFile(SAMPLE_TESTS);
    const lineCount = out.split("\n").length;
    assert.ok(lineCount < 100, `too many lines: ${lineCount}`);
  });
});
