import { test } from "node:test";
import { strict as assert } from "assert";
import {
  getCatalog,
  queryByChangeType,
  getPattern,
  getProvisionalPatterns,
  getCatalogVersion,
} from "./catalog";

test("catalog loads without error", () => {
  const patterns = getCatalog();
  assert.ok(patterns.length > 0, "Catalog should have at least one pattern");
});

test("catalog version is set", () => {
  const version = getCatalogVersion();
  assert.ok(version && version.length > 0, "Version should be set");
});

test("contract-change has at least 5 patterns", () => {
  const patterns = queryByChangeType("contract-change");
  assert.ok(
    patterns.length >= 5,
    `Expected >=5 contract-change patterns, got ${patterns.length}`,
  );
});

test("new-write-endpoint has at least 5 patterns", () => {
  const patterns = queryByChangeType("new-write-endpoint");
  assert.ok(
    patterns.length >= 5,
    `Expected >=5 new-write-endpoint patterns, got ${patterns.length}`,
  );
});

test("getPattern returns params-renamed", () => {
  const pattern = getPattern("params-renamed");
  assert.ok(pattern, "params-renamed pattern should exist");
  assert.equal(pattern.changeType, "contract-change");
});

test("provisional patterns have provisional: true", () => {
  const provisional = getProvisionalPatterns();
  assert.ok(provisional.length > 0, "Should have provisional patterns");
  for (const p of provisional) {
    assert.equal(p.provisional, true);
  }
});

test("all patterns have required fields", () => {
  const patterns = getCatalog();
  for (const p of patterns) {
    assert.ok(p.id, `Pattern missing id`);
    assert.ok(p.name, `Pattern ${p.id} missing name`);
    assert.ok(p.changeType, `Pattern ${p.id} missing changeType`);
    assert.ok(p.description, `Pattern ${p.id} missing description`);
    assert.ok(p.testPattern, `Pattern ${p.id} missing testPattern`);
    assert.ok(
      typeof p.provisional === "boolean",
      `Pattern ${p.id} provisional should be boolean`,
    );
  }
});

test("cascade-change patterns exist", () => {
  const patterns = queryByChangeType("cascade-change");
  assert.ok(
    patterns.length >= 3,
    `Expected >=3 cascade-change patterns, got ${patterns.length}`,
  );
});

test("schema-migration pattern exists", () => {
  const patterns = queryByChangeType("schema-migration");
  assert.ok(patterns.length >= 1, `Expected >=1 schema-migration pattern`);
  assert.equal(patterns[0].id, "migration-drift");
});
