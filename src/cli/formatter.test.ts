import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRunSummary } from "./formatter";
import type { PipelineResult, PipelineError } from "../types/pipeline";

// Fixture: 8 tests across 3 endpoints
const makeResult = (): PipelineResult => ({
  tests: [
    // /users — 2 happy, 1 edge
    {
      testId: "t1",
      endpoint: "/users",
      caseType: "happy",
      payload: {},
      expectedStatus: 200,
    },
    {
      testId: "t2",
      endpoint: "/users",
      caseType: "happy",
      payload: {},
      expectedStatus: 200,
    },
    {
      testId: "t3",
      endpoint: "/users",
      caseType: "edge",
      payload: {},
      expectedStatus: 400,
    },
    // /orders — 1 happy, 1 ai-blind-spot
    {
      testId: "t4",
      endpoint: "/orders",
      caseType: "happy",
      payload: {},
      expectedStatus: 200,
    },
    {
      testId: "t5",
      endpoint: "/orders",
      caseType: "ai-blind-spot",
      payload: {},
      expectedStatus: 500,
      blindSpotPattern: "missing rollback on partial order failure",
    },
    // /items — 1 edge, 2 ai-blind-spot
    {
      testId: "t6",
      endpoint: "/items",
      caseType: "edge",
      payload: {},
      expectedStatus: 422,
    },
    {
      testId: "t7",
      endpoint: "/items",
      caseType: "ai-blind-spot",
      payload: {},
      expectedStatus: 403,
      blindSpotPattern: "auth bypass via crafted item id",
    },
    {
      testId: "t8",
      endpoint: "/items",
      caseType: "ai-blind-spot",
      payload: {},
      expectedStatus: 500,
      // no blindSpotPattern — falls back to testId
    },
  ],
  errors: [],
});

describe("formatRunSummary — table output", () => {
  it("contains all 3 endpoint rows", () => {
    const out = formatRunSummary(makeResult());
    assert.ok(out.includes("/users"), "missing /users row");
    assert.ok(out.includes("/orders"), "missing /orders row");
    assert.ok(out.includes("/items"), "missing /items row");
  });

  it("renders correct counts for /users (2 happy, 1 edge, 0 blind-spot)", () => {
    const out = formatRunSummary(makeResult());
    const lines = out.split("\n");
    const usersLine = lines.find((l) => l.includes("/users"))!;
    assert.ok(usersLine, "/users line not found");
    // Extract numbers: happy=2, edge=1, blind=0, total=3
    const nums = usersLine.trim().split(/\s+/).slice(1).map(Number);
    assert.deepEqual(nums, [2, 1, 0, 3]);
  });

  it("renders correct counts for /orders (1 happy, 0 edge, 1 blind-spot)", () => {
    const out = formatRunSummary(makeResult());
    const lines = out.split("\n");
    const ordersLine = lines.find((l) => l.includes("/orders"))!;
    const nums = ordersLine.trim().split(/\s+/).slice(1).map(Number);
    assert.deepEqual(nums, [1, 0, 1, 2]);
  });

  it("renders correct counts for /items (0 happy, 1 edge, 2 blind-spot)", () => {
    const out = formatRunSummary(makeResult());
    const lines = out.split("\n");
    const itemsLine = lines.find((l) => l.includes("/items"))!;
    const nums = itemsLine.trim().split(/\s+/).slice(1).map(Number);
    assert.deepEqual(nums, [0, 1, 2, 3]);
  });

  it("includes TOTAL row summing all 8 tests", () => {
    const out = formatRunSummary(makeResult());
    assert.ok(out.includes("TOTAL"), "missing TOTAL row");
    const lines = out.split("\n");
    const totalLine = lines.find((l) => l.startsWith("TOTAL"))!;
    const nums = totalLine.trim().split(/\s+/).slice(1).map(Number);
    // happy=3, edge=2, blind=3, total=8
    assert.deepEqual(nums, [3, 2, 3, 8]);
  });
});

describe("formatRunSummary — blind spots section", () => {
  it("prints 'Blind spots detected' header when blind-spot tests exist", () => {
    const out = formatRunSummary(makeResult());
    assert.ok(
      out.includes("Blind spots detected:"),
      "blind spot header missing",
    );
  });

  it("lists each ai-blind-spot description", () => {
    const out = formatRunSummary(makeResult());
    assert.ok(
      out.includes("missing rollback on partial order failure"),
      "t5 blind spot description missing",
    );
    assert.ok(
      out.includes("auth bypass via crafted item id"),
      "t7 blind spot description missing",
    );
    // t8 has no blindSpotPattern — falls back to testId
    assert.ok(out.includes("t8"), "t8 fallback to testId missing");
  });

  it("omits blind spots section when no ai-blind-spot tests present", () => {
    const result: PipelineResult = {
      tests: [
        {
          testId: "t1",
          endpoint: "/ping",
          caseType: "happy",
          payload: {},
          expectedStatus: 200,
        },
      ],
      errors: [],
    };
    const out = formatRunSummary(result);
    assert.ok(
      !out.includes("Blind spots detected:"),
      "unexpected blind spot section",
    );
  });
});

describe("formatRunSummary — PipelineError rendering", () => {
  it("renders stage name and message in expected format", () => {
    const err: PipelineError = {
      stage: "synthesizer",
      message: "LLM returned malformed JSON",
    };
    const out = formatRunSummary(err);
    assert.equal(
      out,
      "[synthesizer] Error: LLM returned malformed JSON — run with --debug for details",
    );
  });

  it("uses the stage field verbatim for all known stages", () => {
    const stages: PipelineError["stage"][] = [
      "ast-parser",
      "schema-detector",
      "classifier",
      "synthesizer",
      "quality-gate",
    ];
    for (const stage of stages) {
      const out = formatRunSummary({ stage, message: "oops" });
      assert.ok(out.startsWith(`[${stage}]`), `stage ${stage} not in output`);
    }
  });
});

describe("formatRunSummary — JSON mode", () => {
  it("returns JSON.stringify of result when json:true", () => {
    const result = makeResult();
    const out = formatRunSummary(result, { json: true });
    const parsed = JSON.parse(out);
    assert.equal(parsed.tests.length, 8);
  });

  it("returns JSON.stringify of PipelineError when json:true", () => {
    const err: PipelineError = { stage: "classifier", message: "bad input" };
    const out = formatRunSummary(err, { json: true });
    const parsed = JSON.parse(out);
    assert.equal(parsed.stage, "classifier");
    assert.equal(parsed.message, "bad input");
  });
});
