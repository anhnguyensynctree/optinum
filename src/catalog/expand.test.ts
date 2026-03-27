import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { generateExpansionCandidates, applyApprovedCandidates } from "./expand";
import { BenchmarkRecord, ExpansionCandidate } from "../types/pipeline";
import { CatalogPattern, BlindSpotCatalog } from "./catalog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTRACT_PATTERN: CatalogPattern = {
  id: "params-renamed",
  name: "Renamed API Parameters",
  changeType: "contract-change",
  description: "AI renames request parameters",
  testPattern: {
    assertType: "field-not-sent",
    description: "Verify caller does not send old parameter names",
    field: "oldParamName",
  },
  ossEvidence: null,
  provisional: true,
  fixtureRef: null,
  severity: "high",
};

function makeBenchmarkRecord(
  overrides: Partial<BenchmarkRecord> = {},
): BenchmarkRecord {
  return {
    repo: "https://github.com/example/repo",
    commitSha: "abc123",
    commitMessage: "refactor: rename params",
    changedFiles: ["src/routes/users.ts"],
    changeTypes: ["contract-change"],
    blindSpotsDetected: ["src/routes/users.ts"],
    laterFixCommit: null,
    bugSignal: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: 3 benchmark records firing contract-change → firesCount: 3
// ---------------------------------------------------------------------------

describe("generateExpansionCandidates", () => {
  it("generates candidate with firesCount:3 when 3 records fire contract-change", () => {
    const records: BenchmarkRecord[] = [
      makeBenchmarkRecord({ commitSha: "sha1" }),
      makeBenchmarkRecord({ commitSha: "sha2" }),
      makeBenchmarkRecord({ commitSha: "sha3" }),
    ];

    const candidates = generateExpansionCandidates({
      benchmarkResults: records,
      existingCatalog: [CONTRACT_PATTERN],
    });

    const cc = candidates.find((c) => c.patternId === "params-renamed");
    assert.ok(cc, "candidate for params-renamed should exist");
    assert.equal(cc.firesCount, 3);
    assert.equal(cc.changeType, "contract-change");
  });

  // -------------------------------------------------------------------------
  // Test 2: crossRefConfirmed:true candidate gets ossEvidence populated
  // -------------------------------------------------------------------------

  it("candidate with crossRefConfirmed:true has ossEvidence populated", () => {
    const records: BenchmarkRecord[] = [
      makeBenchmarkRecord({
        commitSha: "deadbeef",
        laterFixCommit: "fixsha1",
        bugSignal: "GH-123",
      }),
    ];

    const candidates = generateExpansionCandidates({
      benchmarkResults: records,
      existingCatalog: [CONTRACT_PATTERN],
    });

    const cc = candidates.find((c) => c.patternId === "params-renamed");
    assert.ok(cc, "candidate should exist");
    assert.equal(cc.crossRefConfirmed, true);
    assert.equal(cc.evidence.length, 1);
    assert.equal(cc.evidence[0].commitSha, "deadbeef");
    assert.equal(cc.evidence[0].laterFixCommit, "fixsha1");
    assert.equal(cc.evidence[0].bugSignal, "GH-123");
  });

  // -------------------------------------------------------------------------
  // Test 3: applyApprovedCandidates adds approved candidate to catalog
  // -------------------------------------------------------------------------

  it("applyApprovedCandidates adds approved candidate to catalog and passes Zod validation", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "expand-test-"));
    const candidatesPath = path.join(tmpDir, "candidates.json");
    const catalogPath = path.join(tmpDir, "catalog.json");

    // Minimal in-memory catalog (only one pattern)
    const initialCatalog: BlindSpotCatalog = {
      version: "0.1.0",
      patterns: [CONTRACT_PATTERN],
    };
    fs.writeFileSync(catalogPath, JSON.stringify(initialCatalog, null, 2));

    // Candidate approved for the existing pattern
    const approvedCandidate: ExpansionCandidate & { approved: true } = {
      patternId: "params-renamed",
      changeType: "contract-change",
      description: "AI renames request parameters",
      evidence: [
        {
          repo: "https://github.com/example/repo",
          commitSha: "abc123",
          changedFiles: ["src/routes/users.ts"],
          laterFixCommit: "fix456",
          bugSignal: "GH-99",
        },
      ],
      firesCount: 1,
      crossRefConfirmed: true,
      approved: true,
    };
    fs.writeFileSync(
      candidatesPath,
      JSON.stringify([approvedCandidate], null, 2),
    );

    applyApprovedCandidates(candidatesPath, catalogPath);

    const updated = JSON.parse(
      fs.readFileSync(catalogPath, "utf-8"),
    ) as BlindSpotCatalog;
    const pattern = updated.patterns.find((p) => p.id === "params-renamed");

    assert.ok(pattern, "pattern should exist in updated catalog");
    assert.equal(pattern.provisional, false);
    assert.ok(
      pattern.ossEvidence?.includes("abc123"),
      "ossEvidence should contain commitSha",
    );

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("applyApprovedCandidates does not modify catalog when no candidates are approved", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "expand-test-noapp-"));
    const candidatesPath = path.join(tmpDir, "candidates.json");
    const catalogPath = path.join(tmpDir, "catalog.json");

    const initialCatalog: BlindSpotCatalog = {
      version: "0.1.0",
      patterns: [CONTRACT_PATTERN],
    };
    fs.writeFileSync(catalogPath, JSON.stringify(initialCatalog, null, 2));

    const unapprovedCandidate: ExpansionCandidate & { approved: false } = {
      patternId: "params-renamed",
      changeType: "contract-change",
      description: "AI renames request parameters",
      evidence: [],
      firesCount: 0,
      crossRefConfirmed: false,
      approved: false,
    };
    fs.writeFileSync(
      candidatesPath,
      JSON.stringify([unapprovedCandidate], null, 2),
    );

    applyApprovedCandidates(candidatesPath, catalogPath);

    const updated = JSON.parse(
      fs.readFileSync(catalogPath, "utf-8"),
    ) as BlindSpotCatalog;
    const pattern = updated.patterns.find((p) => p.id === "params-renamed");
    assert.ok(pattern, "pattern should still exist");
    assert.equal(pattern.provisional, true, "provisional should not change");
    assert.equal(pattern.ossEvidence, null, "ossEvidence should remain null");

    fs.rmSync(tmpDir, { recursive: true });
  });
});
