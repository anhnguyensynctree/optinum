import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
} from "../types/pipeline";
import { synthesizeTests } from "./synthesizer";
import { buildLayer2Prompt } from "./prompts/layer2";
import { queryByChangeType } from "../catalog/catalog";

// ---- fixtures ----------------------------------------------------------------

const BLAST_RADIUS_CONTRACT: DiffBlastRadius = {
  changed: [
    {
      filePath: "src/api/questionnaire/route.ts",
      functionName: "handler",
      startLine: 1,
      endLine: 30,
    },
  ],
  dependents: [
    {
      filePath: "src/home/actions.ts",
      functionName: "startQuestionnaire",
      startLine: 5,
      endLine: 20,
    },
    {
      filePath: "src/onboarding/actions.ts",
      functionName: "beginOnboarding",
      startLine: 10,
      endLine: 25,
    },
  ],
  dependencies: [],
};

const BLAST_RADIUS_WRITE: DiffBlastRadius = {
  changed: [
    {
      filePath: "src/api/payments/route.ts",
      functionName: "handler",
      startLine: 1,
      endLine: 40,
    },
  ],
  dependents: [
    {
      filePath: "src/checkout/actions.ts",
      functionName: "submitPayment",
      startLine: 8,
      endLine: 30,
    },
  ],
  dependencies: [],
};

const BLAST_RADIUS_NO_CATALOG: DiffBlastRadius = {
  changed: [
    {
      filePath: "src/utils/logger.ts",
      functionName: "log",
      startLine: 1,
      endLine: 10,
    },
  ],
  dependents: [],
  dependencies: [],
};

const CONTRACTS_CONTRACT: EndpointContract[] = [
  {
    endpoint: "/api/questionnaire",
    method: "POST",
    fields: [
      { name: "mode", type: "string", required: true },
      { name: "sessionId", type: "string", required: true },
    ],
    source: "zod",
  },
];

const CONTRACTS_WRITE: EndpointContract[] = [
  {
    endpoint: "/api/payments",
    method: "POST",
    fields: [
      { name: "amount", type: "number", required: true },
      { name: "idempotencyKey", type: "string", required: true },
    ],
    source: "zod",
  },
];

const CONTRACTS_NO_CATALOG: EndpointContract[] = [
  {
    endpoint: "/api/logs",
    method: "POST",
    fields: [{ name: "message", type: "string", required: true }],
    source: "zod",
  },
];

// Layer 1 response — happy/edge tests
const LAYER1_TESTS: SynthesizedTest[] = [
  {
    testId: "t-001",
    endpoint: "/api/questionnaire",
    caseType: "happy",
    payload: { mode: "quick", sessionId: "abc-123" },
    expectedStatus: 200,
  },
  {
    testId: "t-002",
    endpoint: "/api/questionnaire",
    caseType: "edge",
    payload: {},
    expectedStatus: 400,
  },
];

// Layer 2 response — blind spot tests for contract-change
const LAYER2_CONTRACT_TESTS: SynthesizedTest[] = [
  {
    testId: "bs-001",
    endpoint: "/api/questionnaire",
    caseType: "ai-blind-spot",
    payload: { type: "quick", userId: "user-xyz" },
    expectedStatus: 400,
    blindSpotPattern: "params-renamed",
    expectedResult: "FAIL",
  },
  {
    testId: "bs-002",
    endpoint: "/api/questionnaire",
    caseType: "ai-blind-spot",
    payload: { type: "deep", userId: "user-abc" },
    expectedStatus: 400,
    blindSpotPattern: "required-field-added",
    expectedResult: "FAIL",
  },
];

// Layer 2 response — blind spot tests for new-write-endpoint
const LAYER2_WRITE_TESTS: SynthesizedTest[] = [
  {
    testId: "bs-001",
    endpoint: "/api/payments",
    caseType: "ai-blind-spot",
    payload: { amount: 100 },
    expectedStatus: 400,
    blindSpotPattern: "idempotency-missing",
    expectedResult: "FAIL",
  },
  {
    testId: "bs-002",
    endpoint: "/api/payments",
    caseType: "ai-blind-spot",
    payload: { amount: 100, idempotencyKey: "key-123" },
    expectedStatus: 403,
    blindSpotPattern: "auth-ownership-gap",
    expectedResult: "FAIL",
  },
];

// ---- Layer 2 prompt builder tests -------------------------------------------

test("buildLayer2Prompt: produces self-contained adversarial prompt", () => {
  const catalogEntries = queryByChangeType("contract-change");
  const prompt = buildLayer2Prompt({
    blastRadius: BLAST_RADIUS_CONTRACT,
    contracts: CONTRACTS_CONTRACT,
    changeTypes: ["contract-change"],
    catalogEntries,
  });

  assert.ok(typeof prompt === "string", "Prompt must be a string");
  assert.ok(prompt.length > 200, "Prompt must be substantive");
  assert.ok(
    prompt.includes("ai-blind-spot"),
    "Must specify ai-blind-spot caseType",
  );
  assert.ok(prompt.includes("FAIL"), "Must specify expectedResult FAIL");
  assert.ok(prompt.includes("JSON array"), "Must instruct JSON array output");
  assert.ok(
    prompt.includes("blindSpotPattern"),
    "Must include blindSpotPattern field",
  );
  assert.ok(
    !prompt.includes("session context"),
    "Must not reference session context",
  );
  assert.ok(
    !prompt.includes("commit message"),
    "Must not reference commit message",
  );
  assert.ok(
    !prompt.includes("PR description"),
    "Must not reference PR description",
  );
});

test("buildLayer2Prompt: embeds catalog entries inline", () => {
  const catalogEntries = queryByChangeType("contract-change");
  const prompt = buildLayer2Prompt({
    blastRadius: BLAST_RADIUS_CONTRACT,
    contracts: CONTRACTS_CONTRACT,
    changeTypes: ["contract-change"],
    catalogEntries,
  });

  assert.ok(
    prompt.includes("params-renamed") || prompt.includes("Renamed API"),
    "Must embed contract-change catalog patterns",
  );
});

test("buildLayer2Prompt: embeds blast radius dependents", () => {
  const catalogEntries = queryByChangeType("contract-change");
  const prompt = buildLayer2Prompt({
    blastRadius: BLAST_RADIUS_CONTRACT,
    contracts: CONTRACTS_CONTRACT,
    changeTypes: ["contract-change"],
    catalogEntries,
  });

  assert.ok(
    prompt.includes("startQuestionnaire") ||
      prompt.includes("src/home/actions.ts"),
    "Must embed blast radius dependent data",
  );
});

test("buildLayer2Prompt: new-write-endpoint embeds idempotency and auth patterns", () => {
  const catalogEntries = queryByChangeType("new-write-endpoint");
  const prompt = buildLayer2Prompt({
    blastRadius: BLAST_RADIUS_WRITE,
    contracts: CONTRACTS_WRITE,
    changeTypes: ["new-write-endpoint"],
    catalogEntries,
  });

  assert.ok(
    prompt.includes("idempotency-missing") || prompt.includes("Idempotency"),
    "Must embed idempotency pattern",
  );
  assert.ok(
    prompt.includes("auth-ownership-gap") || prompt.includes("Auth Check"),
    "Must embed auth-ownership pattern",
  );
});

// ---- synthesizer Layer 2 integration tests ----------------------------------

test("synthesizeTests: contract-change produces blind spot tests for upward dependents", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_CONTRACT_TESTS),
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS_CONTRACT,
    contracts: CONTRACTS_CONTRACT,
    changeTypes: ["contract-change"],
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null, "Should have no error");

  const blindSpotTests = result.tests.filter(
    (t) => t.caseType === "ai-blind-spot",
  );
  assert.ok(
    blindSpotTests.length >= 1,
    `Expected ≥1 ai-blind-spot test, got ${blindSpotTests.length}`,
  );

  for (const t of blindSpotTests) {
    assert.equal(
      t.caseType,
      "ai-blind-spot",
      `Test ${t.testId} must have caseType ai-blind-spot`,
    );
    assert.equal(
      t.expectedResult,
      "FAIL",
      `Test ${t.testId} must have expectedResult FAIL`,
    );
    assert.ok(
      t.blindSpotPattern !== undefined && t.blindSpotPattern.length > 0,
      `Test ${t.testId} must have blindSpotPattern set`,
    );
  }
});

test("synthesizeTests: Layer 1 and Layer 2 tests are merged in final output", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_CONTRACT_TESTS),
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS_CONTRACT,
    contracts: CONTRACTS_CONTRACT,
    changeTypes: ["contract-change"],
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null, "Should have no error");
  assert.equal(
    result.tests.length,
    LAYER1_TESTS.length + LAYER2_CONTRACT_TESTS.length,
    "Output must be Layer1 + Layer2 tests merged",
  );

  const layer1Ids = LAYER1_TESTS.map((t) => t.testId);
  const layer2Ids = LAYER2_CONTRACT_TESTS.map((t) => t.testId);

  for (const id of layer1Ids) {
    assert.ok(
      result.tests.some((t) => t.testId === id),
      `Layer1 test ${id} must be in merged output`,
    );
  }
  for (const id of layer2Ids) {
    assert.ok(
      result.tests.some((t) => t.testId === id),
      `Layer2 test ${id} must be in merged output`,
    );
  }
});

test("synthesizeTests: new-write-endpoint produces idempotency and auth blind spot tests", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_WRITE_TESTS),
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS_WRITE,
    contracts: CONTRACTS_WRITE,
    changeTypes: ["new-write-endpoint"],
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null, "Should have no error");

  const blindSpotTests = result.tests.filter(
    (t) => t.caseType === "ai-blind-spot",
  );
  assert.ok(
    blindSpotTests.length >= 1,
    "Should produce at least one blind spot test for new-write-endpoint",
  );

  const patterns = blindSpotTests.map((t) => t.blindSpotPattern);
  assert.ok(
    patterns.includes("idempotency-missing") ||
      patterns.includes("auth-ownership-gap") ||
      patterns.includes("auth-check-missing"),
    "Should produce idempotency or auth blind spot pattern test",
  );
});

test("synthesizeTests: missing catalog entry for changeType skips Layer 2 and returns Layer 1 only", async () => {
  let callCount = 0;

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS_NO_CATALOG,
    contracts: CONTRACTS_NO_CATALOG,
    // "unknown" has no catalog entries
    changeTypes: ["unknown"],
    mode: "cli",
    _cliRunner: () => {
      callCount++;
      return JSON.stringify(LAYER1_TESTS);
    },
  });

  assert.equal(result.error, null, "Should have no error");
  assert.equal(
    callCount,
    1,
    "Layer 2 runner must not be called when no catalog entries",
  );
  assert.equal(
    result.tests.length,
    LAYER1_TESTS.length,
    "Output should contain Layer 1 tests only",
  );

  const blindSpotTests = result.tests.filter(
    (t) => t.caseType === "ai-blind-spot",
  );
  assert.equal(
    blindSpotTests.length,
    0,
    "No ai-blind-spot tests when no catalog entries",
  );
});

test("synthesizeTests: Layer 2 failure returns PipelineError and empty tests", async () => {
  let callIndex = 0;
  const runners = [JSON.stringify(LAYER1_TESTS), "not valid json {{{{"];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS_CONTRACT,
    contracts: CONTRACTS_CONTRACT,
    changeTypes: ["contract-change"],
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.ok(
    result.error !== null,
    "Should have a PipelineError when Layer 2 fails",
  );
  assert.equal(result.error!.stage, "synthesizer");
  assert.equal(
    result.tests.length,
    0,
    "Should return empty tests on Layer 2 failure",
  );
});
