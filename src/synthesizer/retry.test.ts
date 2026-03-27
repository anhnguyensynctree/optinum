import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
} from "../types/pipeline";
import { synthesizeTests } from "./synthesizer";
import { SYNTHESIZER_RETRY_MODEL } from "./synthesizer";

// ---- fixtures ----------------------------------------------------------------

const BLAST_RADIUS: DiffBlastRadius = {
  changed: [
    {
      filePath: "src/api/users/route.ts",
      functionName: "handler",
      startLine: 1,
      endLine: 20,
    },
  ],
  dependents: [],
  dependencies: [],
};

const CONTRACTS: EndpointContract[] = [
  {
    endpoint: "/api/users",
    method: "POST",
    fields: [
      { name: "email", type: "string", required: true },
      { name: "name", type: "string", required: true },
    ],
    source: "zod",
  },
];

const VALID_TESTS: SynthesizedTest[] = [
  {
    testId: "t-001",
    endpoint: "/api/users",
    caseType: "happy",
    payload: { email: "user@example.com", name: "Alice" },
    expectedStatus: 200,
  },
];

const VALID_JSON = JSON.stringify(VALID_TESTS);
// Passes JSON.parse but fails Zod schema validation (wrong field types)
const INVALID_SCHEMA_JSON = JSON.stringify([{ testId: 1, endpoint: 2 }]);

// ---- scenario 1: schema-failing mock → retry fires, Haiku used on retry ------

test("scenario 1: schema validation failure triggers retry using Haiku model on second attempt", async () => {
  const capturedModels: string[] = [];
  let callCount = 0;

  // Use "unknown" changeType — no catalog entries → Layer 2 skipped, only Layer 1 retried
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["unknown"],
    mode: "api",
    _apiRunner: async (_prompt: string, model: string) => {
      callCount++;
      capturedModels.push(model);
      if (callCount === 1) {
        // First attempt returns invalid schema to trigger retry
        return INVALID_SCHEMA_JSON;
      }
      // Second attempt (retry) returns valid output
      return VALID_JSON;
    },
  });

  assert.equal(result.error, null, "Should succeed after retry");
  assert.ok(result.tests.length >= 1, "Should return tests after retry");
  assert.ok(
    capturedModels.length >= 2,
    `Expected ≥2 model captures, got ${capturedModels.length}`,
  );
  assert.equal(
    capturedModels[1],
    SYNTHESIZER_RETRY_MODEL,
    `Retry attempt must use Haiku (${SYNTHESIZER_RETRY_MODEL}), got ${capturedModels[1]}`,
  );
});

// ---- scenario 2: two consecutive failures → PipelineError, no third call -----

test("scenario 2: two consecutive schema failures return PipelineError { stage: synthesizer, retries: 2 } without a third call", async () => {
  let callCount = 0;

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    mode: "api",
    _apiRunner: async () => {
      callCount++;
      return INVALID_SCHEMA_JSON;
    },
  });

  assert.ok(result.error !== null, "Should have a PipelineError");
  assert.equal(result.error!.stage, "synthesizer");
  assert.equal(
    result.error!.retries,
    2,
    `Expected retries=2, got ${result.error!.retries}`,
  );
  assert.equal(result.tests.length, 0, "Should return empty tests on failure");
  // maxRetries=2 means 3 total attempts (1 initial + 2 retries)
  assert.equal(
    callCount,
    3,
    `Expected exactly 3 calls (no fourth attempt), got ${callCount}`,
  );
});

// ---- scenario 3: retry succeeds on attempt 2 → valid output returned ---------

test("scenario 3: retry succeeds on second attempt and returns valid output", async () => {
  let callCount = 0;

  // Use "unknown" changeType — no catalog entries → Layer 2 skipped, only Layer 1 retried
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["unknown"],
    mode: "api",
    _apiRunner: async () => {
      callCount++;
      if (callCount === 1) {
        return INVALID_SCHEMA_JSON;
      }
      return VALID_JSON;
    },
  });

  assert.equal(
    result.error,
    null,
    "Should have no error after successful retry",
  );
  assert.ok(result.tests.length >= 1, "Should return tests");
  assert.equal(result.tests[0].testId, "t-001");
  assert.equal(callCount, 2, "Should have called runner exactly twice");
});

// ---- scenario 4: network timeout caught → enters retry loop ------------------

test("scenario 4: network timeout error triggers retry loop and surfaces PipelineError on exhaustion", async () => {
  let callCount = 0;

  const timeoutError = Object.assign(
    new Error("ETIMEDOUT: connection timed out"),
    {
      code: "ETIMEDOUT",
    },
  );

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    mode: "api",
    _apiRunner: async () => {
      callCount++;
      throw timeoutError;
    },
  });

  assert.ok(
    result.error !== null,
    "Should surface PipelineError after timeout exhaustion",
  );
  assert.equal(result.error!.stage, "synthesizer");
  assert.ok(
    result.error!.retries !== undefined && result.error!.retries >= 1,
    `Expected retries ≥ 1 after timeout, got ${result.error!.retries}`,
  );
  // All 3 attempts should have been made (timeout is a retryable error)
  assert.equal(
    callCount,
    3,
    `Expected 3 total calls for timeout exhaustion, got ${callCount}`,
  );
  // The pipeline error message or lastOutput should reference the timeout
  const lastOutput = result.error!.lastOutput as
    | (Error & { code?: string })
    | undefined;
  assert.ok(
    (lastOutput instanceof Error && lastOutput.code === "ETIMEDOUT") ||
      result.error!.message.includes("ETIMEDOUT") ||
      result.error!.message.includes("timed out"),
    "PipelineError should carry the timeout as lastOutput or in message",
  );
});
