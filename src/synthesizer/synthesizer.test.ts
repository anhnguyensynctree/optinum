import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
} from "../types/pipeline";
import { synthesizeTests } from "./synthesizer";
import { buildLayer1Prompt } from "./prompts/layer1";
import { withRetry, RetryExhaustedError } from "./retry";
import { queryByChangeType } from "../catalog/catalog";

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
  dependents: [
    {
      filePath: "src/home/actions.ts",
      functionName: "createUser",
      startLine: 5,
      endLine: 15,
    },
  ],
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
  {
    testId: "t-002",
    endpoint: "/api/users",
    caseType: "edge",
    payload: {},
    expectedStatus: 400,
  },
  {
    testId: "t-003",
    endpoint: "/api/users",
    caseType: "ai-blind-spot",
    payload: { type: "old", userId: "legacy-id" },
    expectedStatus: 400,
    blindSpotPattern: "params-renamed",
    expectedResult: "FAIL",
  },
];

const VALID_JSON = JSON.stringify(VALID_TESTS);

// Invalid: passes JSON.parse but fails Zod (wrong types)
const INVALID_SCHEMA_JSON = JSON.stringify([{ testId: 1, endpoint: 2 }]);

// ---- synthesizer tests -------------------------------------------------------

test("cli mode: happy path produces ≥1 synthesized test", async () => {
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    mode: "cli",
    _cliRunner: () => VALID_JSON,
  });

  assert.equal(result.error, null, "Should have no error");
  assert.ok(
    result.tests.length >= 1,
    `Expected ≥1 test, got ${result.tests.length}`,
  );
  assert.equal(result.tests[0].testId, "t-001");
  assert.equal(result.tests[0].caseType, "happy");
});

test("cli mode: Zod schema validation failure triggers retry; two consecutive failures return PipelineError", async () => {
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    mode: "cli",
    _cliRunner: () => INVALID_SCHEMA_JSON,
  });

  assert.ok(result.error !== null, "Should have a PipelineError");
  assert.equal(result.error!.stage, "synthesizer");
  assert.ok(
    result.error!.message.includes("Zod") ||
      result.error!.message.includes("validation") ||
      result.error!.message.includes("Retry"),
    `Error message should mention Zod or retry, got: ${result.error!.message}`,
  );
  assert.equal(result.tests.length, 0, "Should return empty tests on failure");
  // maxRetries=2 → 3 total attempts → retries reported as 2
  assert.ok(
    result.error!.retries !== undefined && result.error!.retries >= 2,
    `Expected retries ≥ 2, got ${result.error!.retries}`,
  );
});

test("cli mode: JSON parse failure triggers retry and returns PipelineError on exhaustion", async () => {
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    mode: "cli",
    _cliRunner: () => "not valid json at all {{{{",
  });

  assert.ok(result.error !== null, "Should have a PipelineError");
  assert.equal(result.error!.stage, "synthesizer");
  assert.ok(
    result.error!.message.includes("JSON") ||
      result.error!.message.includes("parse") ||
      result.error!.message.includes("Retry"),
    `Error message should reference JSON parse failure, got: ${result.error!.message}`,
  );
  assert.equal(result.tests.length, 0);
});

test("cli mode: succeeds on first retry after initial parse failure", async () => {
  let callCount = 0;
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    mode: "cli",
    _cliRunner: () => {
      callCount++;
      if (callCount === 1) return "INVALID_JSON{{";
      return VALID_JSON;
    },
  });

  assert.equal(result.error, null, "Should succeed on second attempt");
  assert.ok(result.tests.length >= 1, "Should have tests after retry");
  // Layer 1: call 1 fails (parse error), call 2 succeeds. Layer 2 also runs (contract-change
  // has catalog entries), making a third call. Total = 3.
  assert.equal(
    callCount,
    3,
    "Should have called runner 3 times (L1 fail, L1 retry, L2)",
  );
});

test("api mode: happy path via _apiRunner mock returns tests", async () => {
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    mode: "api",
    _apiRunner: async () => VALID_JSON,
  });

  assert.equal(result.error, null, "Should have no error");
  assert.ok(result.tests.length >= 1, "Should return tests from api mode");
});

test("api mode: Zod failure returns PipelineError", async () => {
  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    mode: "api",
    _apiRunner: async () => INVALID_SCHEMA_JSON,
  });

  assert.ok(result.error !== null, "Should have PipelineError in api mode");
  assert.equal(result.error!.stage, "synthesizer");
});

// ---- prompt tests ------------------------------------------------------------

test("buildLayer1Prompt: produces self-contained prompt with schema, contracts, no session context", () => {
  const catalogEntries = queryByChangeType("contract-change");
  const prompt = buildLayer1Prompt({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    catalogEntries,
  });

  assert.ok(typeof prompt === "string", "Prompt should be a string");
  assert.ok(prompt.length > 200, "Prompt should be substantive");
  assert.ok(prompt.includes("JSON array"), "Should instruct JSON array output");
  assert.ok(prompt.includes("testId"), "Should include schema field names");
  assert.ok(prompt.includes("caseType"), "Should include caseType in schema");
  assert.ok(prompt.includes("/api/users"), "Should embed contract data");
  assert.ok(
    !prompt.includes("session context"),
    "Must not reference session context",
  );
  assert.ok(
    !prompt.includes("PR description"),
    "Must not reference PR description",
  );
  assert.ok(
    !prompt.includes("commit message"),
    "Must not reference commit message",
  );
});

test("buildLayer1Prompt: embeds catalog entries for given changeTypes", () => {
  const catalogEntries = queryByChangeType("contract-change");
  const prompt = buildLayer1Prompt({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["contract-change"],
    catalogEntries,
  });

  assert.ok(
    prompt.includes("params-renamed") || prompt.includes("Renamed API"),
    "Should embed catalog pattern data",
  );
});

// ---- retry tests -------------------------------------------------------------

test("withRetry: resolves immediately when fn succeeds on first call", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return "ok";
  }, 2);
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withRetry: retries up to maxRetries times and throws RetryExhaustedError", async () => {
  let calls = 0;
  await assert.rejects(
    async () => {
      await withRetry(async () => {
        calls++;
        throw new Error("fail");
      }, 2);
    },
    (err: unknown) => {
      assert.ok(
        err instanceof RetryExhaustedError,
        "Should be RetryExhaustedError",
      );
      assert.equal(
        err.attempts,
        3,
        "Should report 3 total attempts (1 + 2 retries)",
      );
      return true;
    },
  );
  assert.equal(calls, 3, "fn should be called 3 times total");
});

test("withRetry: succeeds on second attempt", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 2) throw new Error("not yet");
    return "done";
  }, 2);
  assert.equal(result, "done");
  assert.equal(calls, 2);
});

test("withRetry: default maxRetries is 2 (3 total attempts)", async () => {
  let calls = 0;
  await assert.rejects(
    async () => {
      await withRetry(async () => {
        calls++;
        throw new Error("always fails");
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof RetryExhaustedError);
      return true;
    },
  );
  assert.equal(calls, 3);
});
