import { test } from "node:test";
import { strict as assert } from "assert";
import * as path from "path";
import { detectSchemas } from "./ts-schema-detector";

const FIXTURES_ROOT = path.join(__dirname, "../../fixtures");

test("fixture-001: detects Zod schema with mode and sessionId fields", () => {
  const routeFile = path.join(
    FIXTURES_ROOT,
    "fixture-001-contract-change/after/src/api/questionnaire/route.ts",
  );
  const contracts = detectSchemas(
    [routeFile],
    path.join(FIXTURES_ROOT, "fixture-001-contract-change/after"),
  );

  assert.ok(contracts.length > 0, "Should return at least one contract");
  const contract = contracts.find((c) => c.source === "zod");
  assert.ok(
    contract,
    `No zod contract found. Found: ${JSON.stringify(contracts)}`,
  );

  const fieldNames = contract.fields.map((f) => f.name);
  assert.ok(
    fieldNames.includes("mode"),
    `'mode' not found in fields: ${fieldNames}`,
  );
  assert.ok(
    fieldNames.includes("sessionId"),
    `'sessionId' not found in fields: ${fieldNames}`,
  );
});

test("fixture-001: mode field is enum type", () => {
  const routeFile = path.join(
    FIXTURES_ROOT,
    "fixture-001-contract-change/after/src/api/questionnaire/route.ts",
  );
  const contracts = detectSchemas(
    [routeFile],
    path.join(FIXTURES_ROOT, "fixture-001-contract-change/after"),
  );
  const contract = contracts.find((c) => c.source === "zod");
  assert.ok(contract);

  const modeField = contract.fields.find((f) => f.name === "mode");
  assert.ok(modeField, "mode field not found");
  assert.ok(
    modeField.type.startsWith("enum:"),
    `mode type should be enum, got: ${modeField.type}`,
  );
});

test("fixture-001: sessionId field is string:uuid type", () => {
  const routeFile = path.join(
    FIXTURES_ROOT,
    "fixture-001-contract-change/after/src/api/questionnaire/route.ts",
  );
  const contracts = detectSchemas(
    [routeFile],
    path.join(FIXTURES_ROOT, "fixture-001-contract-change/after"),
  );
  const contract = contracts.find((c) => c.source === "zod");
  assert.ok(contract);

  const sessionIdField = contract.fields.find((f) => f.name === "sessionId");
  assert.ok(sessionIdField, "sessionId field not found");
  assert.equal(
    sessionIdField.type,
    "string:uuid",
    `sessionId type should be string:uuid, got: ${sessionIdField.type}`,
  );
});

test("source is zod when Zod schema is present", () => {
  const routeFile = path.join(
    FIXTURES_ROOT,
    "fixture-001-contract-change/after/src/api/questionnaire/route.ts",
  );
  const contracts = detectSchemas(
    [routeFile],
    path.join(FIXTURES_ROOT, "fixture-001-contract-change/after"),
  );
  const zodContracts = contracts.filter((c) => c.source === "zod");
  assert.ok(zodContracts.length > 0, "Should have at least one zod contract");
});

test("nonexistent file returns empty array without throwing", () => {
  let result: ReturnType<typeof detectSchemas>;
  try {
    result = detectSchemas(["/nonexistent/path/route.ts"], "/nonexistent");
  } catch (e) {
    assert.fail(`Should not throw: ${e}`);
  }
  assert.ok(Array.isArray(result!), "Should return array");
});
