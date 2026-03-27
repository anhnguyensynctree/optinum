import { test } from "node:test";
import { strict as assert } from "assert";
import * as path from "path";
import { parseBlastRadius } from "./ts-parser";

const FIXTURES_ROOT = path.join(__dirname, "../../fixtures");

test("fixture-001: upward traversal finds home/actions.ts", () => {
  const result = parseBlastRadius({
    projectRoot: path.join(FIXTURES_ROOT, "fixture-001-contract-change/after"),
    changedFiles: ["src/api/questionnaire/route.ts"],
  });
  const depPaths = result.dependents.map((d) => d.filePath);
  const found = depPaths.some((p) => p.includes("home/actions"));
  assert.ok(
    found,
    `home/actions.ts not found in dependents. Found: ${depPaths.join(", ")}`,
  );
});

test("fixture-001: upward traversal finds onboarding/actions.ts", () => {
  const result = parseBlastRadius({
    projectRoot: path.join(FIXTURES_ROOT, "fixture-001-contract-change/after"),
    changedFiles: ["src/api/questionnaire/route.ts"],
  });
  const depPaths = result.dependents.map((d) => d.filePath);
  const found = depPaths.some((p) => p.includes("onboarding/actions"));
  assert.ok(
    found,
    `onboarding/actions.ts not found in dependents. Found: ${depPaths.join(", ")}`,
  );
});

test("fixture-001: changed file captured", () => {
  const result = parseBlastRadius({
    projectRoot: path.join(FIXTURES_ROOT, "fixture-001-contract-change/after"),
    changedFiles: ["src/api/questionnaire/route.ts"],
  });
  assert.ok(result.changed.length > 0, "No changed functions found");
});

test("malformed path returns empty blast radius without throwing", () => {
  let result;
  try {
    result = parseBlastRadius({
      projectRoot: path.join(
        FIXTURES_ROOT,
        "fixture-001-contract-change/after",
      ),
      changedFiles: ["src/nonexistent/file.ts"],
    });
  } catch (e) {
    assert.fail(`Should not throw: ${e}`);
  }
  assert.ok(result, "Should return a result");
  assert.ok(Array.isArray(result.dependents));
});
