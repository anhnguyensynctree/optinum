import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
} from "../types/pipeline";
import { synthesizeTests } from "./synthesizer";
import { buildLayer3Prompt } from "./prompts/layer3";

// ---- fixtures ----------------------------------------------------------------

const BLAST_RADIUS: DiffBlastRadius = {
  changed: [
    {
      filePath: "src/api/run/route.ts",
      functionName: "POST",
      startLine: 1,
      endLine: 25,
    },
  ],
  dependents: [
    {
      filePath: "src/cron/scheduler.ts",
      functionName: "triggerRun",
      startLine: 10,
      endLine: 20,
    },
  ],
  dependencies: [],
};

const CONTRACTS: EndpointContract[] = [
  {
    endpoint: "/api/run",
    method: "POST",
    fields: [
      { name: "input", type: "string", required: true },
      { name: "context", type: "object", required: false },
    ],
    source: "zod",
  },
];

// Simulates quoagent PR#33 — Jules added /api/run with no auth check
const RAW_DIFF = `
diff --git a/src/api/run/route.ts b/src/api/run/route.ts
new file mode 100644
--- /dev/null
+++ b/src/api/run/route.ts
@@ -0,0 +1,15 @@
+import { NextRequest, NextResponse } from "next/server";
+import { runAgent } from "@/lib/agent";
+
+export async function POST(req: NextRequest) {
+  const body = await req.json();
+  const result = await runAgent({
+    input: body.input,
+    context: body.context,
+  });
+  return NextResponse.json({ ok: true, result });
+}
`.trim();

// Layer 1 response
const LAYER1_TESTS: SynthesizedTest[] = [
  {
    testId: "t-001",
    endpoint: "/api/run",
    caseType: "happy",
    payload: { input: "test prompt", context: {} },
    expectedStatus: 200,
  },
];

// Layer 2 response
const LAYER2_TESTS: SynthesizedTest[] = [
  {
    testId: "bs-001",
    endpoint: "/api/run",
    caseType: "ai-blind-spot",
    payload: {},
    expectedStatus: 401,
    blindSpotPattern: "input-trust-violation",
    expectedResult: "FAIL",
  },
];

// Layer 3 response — discovered pattern, no catalog reference
const LAYER3_TESTS: SynthesizedTest[] = [
  {
    testId: "dp-001",
    endpoint: "/api/run",
    caseType: "ai-blind-spot",
    payload: {},
    expectedStatus: 401,
    expectedResult: "FAIL",
    discoveredPattern: {
      id: "dp-001",
      name: "unauthenticated-trigger-endpoint",
      mechanism:
        "New POST endpoint accepts any caller without checking Authorization header. Any client with the URL can trigger expensive downstream operations.",
      aiNativeReason:
        "AI generated the business logic correctly but did not see any existing auth middleware in the diff context. It modelled what was shown: the operation — not the security boundary.",
    },
  },
];

// ---- buildLayer3Prompt tests ------------------------------------------------

test("buildLayer3Prompt: produces prompt containing raw diff", () => {
  const prompt = buildLayer3Prompt({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
  });

  assert.ok(typeof prompt === "string", "Prompt must be a string");
  assert.ok(prompt.length > 200, "Prompt must be substantive");
  assert.ok(prompt.includes(RAW_DIFF), "Prompt must embed the raw diff");
});

test("buildLayer3Prompt: does not reference any catalog or known pattern list", () => {
  const prompt = buildLayer3Prompt({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
  });

  assert.ok(
    !prompt.includes("catalogEntries"),
    "Prompt must not reference catalogEntries",
  );
  assert.ok(
    !prompt.includes("Relevant Blind Spot Catalog"),
    "Prompt must not have catalog section header",
  );
  assert.ok(
    !prompt.includes("session context"),
    "Prompt must not reference session context",
  );
  assert.ok(
    !prompt.includes("commit message"),
    "Prompt must not reference commit message",
  );
});

test("buildLayer3Prompt: instructs discoveredPattern field with required sub-fields", () => {
  const prompt = buildLayer3Prompt({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
  });

  assert.ok(
    prompt.includes("discoveredPattern"),
    "Prompt must require discoveredPattern field",
  );
  assert.ok(
    prompt.includes("mechanism"),
    "Prompt must include mechanism field",
  );
  assert.ok(
    prompt.includes("aiNativeReason"),
    "Prompt must include aiNativeReason field",
  );
});

test("buildLayer3Prompt: embeds blast radius and contracts", () => {
  const prompt = buildLayer3Prompt({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
  });

  assert.ok(
    prompt.includes("triggerRun") || prompt.includes("src/cron/scheduler.ts"),
    "Prompt must embed blast radius dependents",
  );
  assert.ok(
    prompt.includes("/api/run"),
    "Prompt must embed endpoint contracts",
  );
});

// ---- synthesizer Layer 3 integration tests ----------------------------------

test("synthesizeTests: rawDiff triggers Layer 3 after Layer 1 and Layer 2", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_TESTS),
    JSON.stringify(LAYER3_TESTS),
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null, "Should have no error");
  assert.equal(
    callIndex,
    3,
    "All three layers must be called when rawDiff is provided",
  );
  assert.equal(
    result.tests.length,
    LAYER1_TESTS.length + LAYER2_TESTS.length + LAYER3_TESTS.length,
    "Output must merge Layer1 + Layer2 + Layer3 tests",
  );
});

test("synthesizeTests: Layer 3 tests have discoveredPattern field", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_TESTS),
    JSON.stringify(LAYER3_TESTS),
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null, "Should have no error");

  const discoveryTests = result.tests.filter(
    (t) => t.discoveredPattern !== undefined,
  );
  assert.ok(
    discoveryTests.length >= 1,
    "At least one Layer 3 test must have discoveredPattern",
  );

  const dp = discoveryTests[0].discoveredPattern!;
  assert.ok(typeof dp.id === "string" && dp.id.length > 0, "id must be set");
  assert.ok(
    typeof dp.name === "string" && dp.name.length > 0,
    "name must be set",
  );
  assert.ok(
    typeof dp.mechanism === "string" && dp.mechanism.length > 0,
    "mechanism must be set",
  );
  assert.ok(
    typeof dp.aiNativeReason === "string" && dp.aiNativeReason.length > 0,
    "aiNativeReason must be set",
  );
});

test("synthesizeTests: result.discoveredPatterns surfaces deduplicated Layer 3 patterns", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_TESTS),
    JSON.stringify(LAYER3_TESTS),
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null);
  assert.ok(
    Array.isArray(result.discoveredPatterns),
    "discoveredPatterns must be an array",
  );
  assert.equal(
    result.discoveredPatterns.length,
    1,
    "One distinct pattern from LAYER3_TESTS fixture",
  );
  assert.equal(
    result.discoveredPatterns[0].name,
    "unauthenticated-trigger-endpoint",
  );
});

test("synthesizeTests: discoveredPatterns is empty when no rawDiff", async () => {
  let callIndex = 0;
  const runners = [JSON.stringify(LAYER1_TESTS), JSON.stringify(LAYER2_TESTS)];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null);
  assert.deepEqual(
    result.discoveredPatterns,
    [],
    "discoveredPatterns must be empty without rawDiff",
  );
});

test("synthesizeTests: no rawDiff skips Layer 3, returns only Layer1 + Layer2", async () => {
  let callCount = 0;
  const runners = [JSON.stringify(LAYER1_TESTS), JSON.stringify(LAYER2_TESTS)];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    // rawDiff intentionally omitted
    mode: "cli",
    _cliRunner: () => runners[callCount++],
  });

  assert.equal(result.error, null, "Should have no error");
  assert.equal(callCount, 2, "Layer 3 must not be called without rawDiff");
  assert.equal(
    result.tests.length,
    LAYER1_TESTS.length + LAYER2_TESTS.length,
    "Without rawDiff, output is Layer1 + Layer2 only",
  );
});

test("synthesizeTests: Layer 3 failure returns PipelineError and empty tests", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_TESTS),
    "not valid json {{{{",
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.ok(
    result.error !== null,
    "Should have a PipelineError when Layer 3 fails",
  );
  assert.equal(result.error!.stage, "synthesizer");
  assert.equal(
    result.tests.length,
    0,
    "Should return empty tests on Layer 3 failure",
  );
});

test("synthesizeTests: Layer 3 empty array result (no contract-breaking changes) is valid", async () => {
  let callIndex = 0;
  const runners = [
    JSON.stringify(LAYER1_TESTS),
    JSON.stringify(LAYER2_TESTS),
    "[]", // Layer 3 finds nothing novel
  ];

  const result = await synthesizeTests({
    blastRadius: BLAST_RADIUS,
    contracts: CONTRACTS,
    changeTypes: ["new-write-endpoint"],
    rawDiff: RAW_DIFF,
    mode: "cli",
    _cliRunner: () => runners[callIndex++],
  });

  assert.equal(result.error, null, "Empty Layer 3 result must not be an error");
  assert.equal(
    result.tests.length,
    LAYER1_TESTS.length + LAYER2_TESTS.length,
    "Output must be Layer1 + Layer2 when Layer 3 returns empty",
  );
});
