import { strict as assert } from "assert";
import { test } from "node:test";
import {
  SynthesizedTestSchema,
  DiffBlastRadiusSchema,
  PipelineErrorSchema,
  FunctionNodeSchema,
} from "./pipeline";

test("SynthesizedTestSchema rejects missing testId", () => {
  const result = SynthesizedTestSchema.safeParse({
    endpoint: "/api/test",
    caseType: "happy",
    payload: {},
    expectedStatus: 200,
  });
  assert.equal(result.success, false);
});

test("SynthesizedTestSchema rejects invalid caseType", () => {
  const result = SynthesizedTestSchema.safeParse({
    testId: "001-A",
    endpoint: "/api/test",
    caseType: "invalid",
    payload: {},
    expectedStatus: 200,
  });
  assert.equal(result.success, false);
});

test("SynthesizedTestSchema accepts valid test", () => {
  const result = SynthesizedTestSchema.safeParse({
    testId: "001-A",
    endpoint: "/api/questionnaire",
    caseType: "happy",
    payload: {
      mode: "quick",
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
    },
    expectedStatus: 200,
  });
  assert.equal(result.success, true);
});

test("DiffBlastRadiusSchema accepts valid blast radius", () => {
  const result = DiffBlastRadiusSchema.safeParse({
    changed: [
      {
        filePath: "src/api/route.ts",
        functionName: "POST",
        startLine: 1,
        endLine: 15,
      },
    ],
    dependents: [
      {
        filePath: "src/home/actions.ts",
        functionName: "startQuestionnaire",
        startLine: 1,
        endLine: 10,
      },
    ],
    dependencies: [],
  });
  assert.equal(result.success, true);
});

test("PipelineErrorSchema validates stage enum", () => {
  const valid = PipelineErrorSchema.safeParse({
    stage: "ast-parser",
    message: "parse failed",
  });
  assert.equal(valid.success, true);

  const invalid = PipelineErrorSchema.safeParse({
    stage: "unknown-stage",
    message: "fail",
  });
  assert.equal(invalid.success, false);
});

test("SynthesizedTestSchema accepts ai-blind-spot with expectedResult FAIL", () => {
  const result = SynthesizedTestSchema.safeParse({
    testId: "001-C",
    endpoint: "/api/questionnaire",
    caseType: "ai-blind-spot",
    payload: { type: "quick", userId: "123" },
    expectedStatus: 200,
    blindSpotPattern: "params-renamed",
    expectedResult: "FAIL",
  });
  assert.equal(result.success, true);
});
