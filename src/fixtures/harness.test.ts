import { test } from "node:test";
import { strict as assert } from "assert";
import * as path from "path";
import {
  validateFixtureSchema,
  loadFixtures,
  countBlindSpotTests,
  countMustFailTests,
} from "./harness";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures");

test("validateFixtureSchema rejects null", () => {
  assert.equal(validateFixtureSchema(null), false);
});

test("validateFixtureSchema rejects object missing required fields", () => {
  assert.equal(
    validateFixtureSchema({ fixture: "test", description: "x" }),
    false,
  );
});

test("validateFixtureSchema accepts valid fixture output", () => {
  const valid = {
    fixture: "fixture-001-contract-change",
    description: "test",
    diffFile: "after/src/api/questionnaire/route.ts",
    schemaSource: "Zod",
    expectedBlastRadius: { changed: [], dependents: [], dependencies: [] },
    expectedChangeType: "contract-change",
    expectedTests: [],
    passCriteria: { bugCaughtVia: "upward blast radius" },
    failCriteria: [],
  };
  assert.equal(validateFixtureSchema(valid), true);
});

test("loadFixtures finds fixture-001", () => {
  const fixtures = loadFixtures(FIXTURES_DIR);
  const f001 = fixtures.find((f) => f.name === "fixture-001-contract-change");
  assert.ok(f001, "fixture-001-contract-change not found");
  assert.ok(f001.output !== null, `fixture-001 failed to load: ${f001?.error}`);
});

test("fixture-001 has 2 ai-blind-spot tests", () => {
  const fixtures = loadFixtures(FIXTURES_DIR);
  const f001 = fixtures.find((f) => f.name === "fixture-001-contract-change");
  assert.ok(f001?.output);
  const blindSpotCount = countBlindSpotTests(f001.output);
  assert.equal(
    blindSpotCount,
    2,
    `Expected 2 blind spot tests, got ${blindSpotCount}`,
  );
});

test("fixture-001 has 2 tests that must fail", () => {
  const fixtures = loadFixtures(FIXTURES_DIR);
  const f001 = fixtures.find((f) => f.name === "fixture-001-contract-change");
  assert.ok(f001?.output);
  const mustFailCount = countMustFailTests(f001.output);
  assert.equal(
    mustFailCount,
    2,
    `Expected 2 must-fail tests, got ${mustFailCount}`,
  );
});

test("all fixtures in directory have valid schemas", () => {
  const fixtures = loadFixtures(FIXTURES_DIR);
  assert.ok(fixtures.length > 0, "No fixtures found");
  const invalid = fixtures.filter((f) => f.output === null);
  if (invalid.length > 0) {
    const msgs = invalid.map((f) => `${f.name}: ${f.error}`).join(", ");
    assert.fail(`${invalid.length} fixtures have invalid schemas: ${msgs}`);
  }
});
