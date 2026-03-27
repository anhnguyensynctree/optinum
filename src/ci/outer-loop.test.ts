import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../types/pipeline";
import {
  runOuterLoop,
  type OuterLoopFixture,
  type OuterLoopRunners,
} from "./outer-loop";

// ---- shared fixtures --------------------------------------------------------

const BASE_BLAST_RADIUS: DiffBlastRadius = {
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

const BASE_CONTRACTS: EndpointContract[] = [
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

const BASE_CHANGE_TYPES: ChangeType[] = ["contract-change"];

const BASE_FIXTURE: OuterLoopFixture = {
  blastRadius: BASE_BLAST_RADIUS,
  contracts: BASE_CONTRACTS,
  changeTypes: BASE_CHANGE_TYPES,
};

// ---- stable mock synthesizer ------------------------------------------------

function makeSynthesisTests(extra?: SynthesizedTest[]): SynthesizedTest[] {
  const base: SynthesizedTest[] = [
    {
      testId: "t-001",
      endpoint: "/api/users",
      caseType: "happy",
      payload: { email: "user@example.com", name: "Alice" },
      expectedStatus: 200,
      blindSpotPattern: "missing-required-field",
    },
    {
      testId: "t-002",
      endpoint: "/api/users",
      caseType: "edge",
      payload: { email: "" },
      expectedStatus: 400,
      blindSpotPattern: "missing-required-field",
    },
  ];
  return extra ? [...base, ...extra] : base;
}

// ---- MR-1: no-op refactor ---------------------------------------------------

test("MR-1 passes when no-op mutation produces same blind spot patterns", async () => {
  // Both base and mutated blast radius return the same tests → MR passes
  const stableRunner = async (
    _br: DiffBlastRadius,
    _c: EndpointContract[],
    _ct: ChangeType[],
  ) => makeSynthesisTests();

  const runners: OuterLoopRunners = {
    synthesisRunner: stableRunner,
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr1Violations = report.violations.filter((v) => v.mrId === "MR-1");
  assert.equal(mr1Violations.length, 0, "MR-1 should pass");
});

test("MR-1 detects violation when no-op mutation changes blind spot patterns", async () => {
  let callCount = 0;
  // First call (base) returns pattern A; second call (mutated) returns pattern B
  const unstableRunner = async (
    _br: DiffBlastRadius,
    _c: EndpointContract[],
    _ct: ChangeType[],
  ): Promise<SynthesizedTest[]> => {
    callCount++;
    if (callCount === 1) {
      return makeSynthesisTests();
    }
    // Different blindSpotPattern on second call — simulates catalog sensitivity
    return [
      {
        testId: "t-001",
        endpoint: "/api/users",
        caseType: "happy",
        payload: { email: "user@example.com", name: "Alice" },
        expectedStatus: 200,
        blindSpotPattern: "auth-bypass-new-pattern",
      },
    ];
  };

  const runners: OuterLoopRunners = {
    synthesisRunner: unstableRunner,
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr1Violations = report.violations.filter((v) => v.mrId === "MR-1");
  assert.equal(mr1Violations.length, 1, "MR-1 violation should be detected");
  assert.ok(
    mr1Violations[0].message.includes("MR-1 violation"),
    "violation message should reference MR-1",
  );
});

// ---- MR-2: variable rename --------------------------------------------------

test("MR-2 passes when rename mutation produces same changeTypes", async () => {
  // Classifier returns the same types regardless of function name suffix
  const stableClassifier = (_br: DiffBlastRadius): ChangeType[] =>
    BASE_CHANGE_TYPES;

  const runners: OuterLoopRunners = {
    synthesisRunner: async () => makeSynthesisTests(),
    classifyRunner: stableClassifier,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr2Violations = report.violations.filter((v) => v.mrId === "MR-2");
  assert.equal(mr2Violations.length, 0, "MR-2 should pass");
});

test("MR-2 detects violation when rename mutation changes changeTypes", async () => {
  // Classifier returns different types when function name contains "_renamed"
  const sensitiveClassifier = (br: DiffBlastRadius): ChangeType[] => {
    const hasRename = br.changed.some((n) =>
      n.functionName.endsWith("_renamed"),
    );
    return hasRename ? ["schema-migration"] : BASE_CHANGE_TYPES;
  };

  const runners: OuterLoopRunners = {
    synthesisRunner: async () => makeSynthesisTests(),
    classifyRunner: sensitiveClassifier,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr2Violations = report.violations.filter((v) => v.mrId === "MR-2");
  assert.equal(mr2Violations.length, 1, "MR-2 violation should be detected");
  assert.ok(
    mr2Violations[0].message.includes("MR-2 violation"),
    "violation message should reference MR-2",
  );
});

// ---- MR-3: duplicate unchanged function -------------------------------------

test("MR-3 passes when duplicate mutation does not expand dependents", async () => {
  // Blast radius runner returns the exact blast radius it received — stable
  const stableBlastRunner = async (br: DiffBlastRadius) => br;

  const runners: OuterLoopRunners = {
    synthesisRunner: async () => makeSynthesisTests(),
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: stableBlastRunner,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr3Violations = report.violations.filter((v) => v.mrId === "MR-3");
  assert.equal(mr3Violations.length, 0, "MR-3 should pass");
});

test("MR-3 detects violation when duplicate mutation expands dependents", async () => {
  // Blast radius runner adds a brand-new (non-dup) dependent on mutated input
  let callCount = 0;
  const expandingBlastRunner = async (
    br: DiffBlastRadius,
  ): Promise<DiffBlastRadius> => {
    callCount++;
    if (callCount === 2) {
      // Second call is with the mutated (dup) blast radius — inject a new unexpected dependent
      return {
        ...br,
        dependents: [
          ...br.dependents,
          {
            filePath: "src/new/unexpected.ts",
            functionName: "unexpectedCallerAdded",
            startLine: 1,
            endLine: 5,
          },
        ],
      };
    }
    return br;
  };

  const runners: OuterLoopRunners = {
    synthesisRunner: async () => makeSynthesisTests(),
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: expandingBlastRunner,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr3Violations = report.violations.filter((v) => v.mrId === "MR-3");
  assert.equal(mr3Violations.length, 1, "MR-3 violation should be detected");
  assert.ok(
    mr3Violations[0].message.includes("MR-3 violation"),
    "violation message should reference MR-3",
  );
});

// ---- MR-4: comment block ----------------------------------------------------

test("MR-4 passes when comment mutation produces structurally equivalent tests", async () => {
  // Stable runner returns same caseTypes + payload keys regardless of line range
  const stableRunner = async () => makeSynthesisTests();

  const runners: OuterLoopRunners = {
    synthesisRunner: stableRunner,
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr4Violations = report.violations.filter((v) => v.mrId === "MR-4");
  assert.equal(mr4Violations.length, 0, "MR-4 should pass");
});

test("MR-4 detects violation when comment mutation changes test structures", async () => {
  // MR-4's mutation increases endLine by 5. Use that to distinguish calls.
  // Base fixture has endLine=20, mutated has endLine=25.
  const sensitiveRunner = async (
    br: DiffBlastRadius,
    _c: EndpointContract[],
    _ct: ChangeType[],
  ): Promise<SynthesizedTest[]> => {
    const isMutated = br.changed.some((n) => n.endLine > 20);
    if (!isMutated) {
      return makeSynthesisTests();
    }
    // After comment added: different caseType breakdown — ai-blind-spot added
    return [
      ...makeSynthesisTests(),
      {
        testId: "t-003",
        endpoint: "/api/users",
        caseType: "ai-blind-spot",
        payload: { extra: "field" },
        expectedStatus: 422,
      },
    ];
  };

  const runners: OuterLoopRunners = {
    synthesisRunner: sensitiveRunner,
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE], runners);
  const mr4Violations = report.violations.filter((v) => v.mrId === "MR-4");
  assert.equal(mr4Violations.length, 1, "MR-4 violation should be detected");
  assert.ok(
    mr4Violations[0].message.includes("MR-4 violation"),
    "violation message should reference MR-4",
  );
});

// ---- MR-5: equivalent fixtures ----------------------------------------------

const FIXTURE_B: OuterLoopFixture = {
  blastRadius: {
    changed: [
      {
        filePath: "src/api/orders/route.ts",
        functionName: "createOrder",
        startLine: 1,
        endLine: 20,
      },
    ],
    dependents: [
      {
        filePath: "src/home/order-actions.ts",
        functionName: "submitOrder",
        startLine: 5,
        endLine: 15,
      },
    ],
    dependencies: [],
  },
  // Same field names as BASE_CONTRACTS: email + name
  contracts: [
    {
      endpoint: "/api/orders",
      method: "POST",
      fields: [
        { name: "email", type: "string", required: true },
        { name: "name", type: "string", required: true },
      ],
      source: "zod",
    },
  ],
  changeTypes: BASE_CHANGE_TYPES,
};

test("MR-5 passes when two fixtures with same schema produce equivalent test structures", async () => {
  // Runner always returns same caseType distribution
  const stableRunner = async (
    _br: DiffBlastRadius,
    contracts: EndpointContract[],
  ) =>
    contracts[0].endpoint === "/api/orders"
      ? [
          {
            testId: "o-001",
            endpoint: "/api/orders",
            caseType: "happy" as const,
            payload: { email: "a@b.com", name: "Bob" },
            expectedStatus: 200,
          },
          {
            testId: "o-002",
            endpoint: "/api/orders",
            caseType: "edge" as const,
            payload: { email: "" },
            expectedStatus: 400,
          },
        ]
      : makeSynthesisTests();

  const runners: OuterLoopRunners = {
    synthesisRunner: stableRunner,
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE, FIXTURE_B], runners);
  const mr5Violations = report.violations.filter((v) => v.mrId === "MR-5");
  assert.equal(mr5Violations.length, 0, "MR-5 should pass");
});

test("MR-5 detects violation when equivalent fixtures produce different test structures", async () => {
  // Runner returns different caseType distributions per endpoint
  const divergingRunner = async (
    _br: DiffBlastRadius,
    contracts: EndpointContract[],
  ): Promise<SynthesizedTest[]> => {
    if (contracts[0].endpoint === "/api/orders") {
      return [
        {
          testId: "o-001",
          endpoint: "/api/orders",
          caseType: "happy",
          payload: { email: "a@b.com", name: "Bob" },
          expectedStatus: 200,
        },
        // Extra auth test that base fixture doesn't have — structural divergence
        {
          testId: "o-003",
          endpoint: "/api/orders",
          caseType: "auth",
          payload: {},
          expectedStatus: 401,
        },
      ];
    }
    return makeSynthesisTests();
  };

  const runners: OuterLoopRunners = {
    synthesisRunner: divergingRunner,
    classifyRunner: () => BASE_CHANGE_TYPES,
    blastRadiusRunner: async (br) => br,
  };

  const report = await runOuterLoop([BASE_FIXTURE, FIXTURE_B], runners);
  const mr5Violations = report.violations.filter((v) => v.mrId === "MR-5");
  assert.equal(mr5Violations.length, 1, "MR-5 violation should be detected");
  assert.ok(
    mr5Violations[0].message.includes("MR-5 violation"),
    "violation message should reference MR-5",
  );
});
