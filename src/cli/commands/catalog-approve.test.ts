import { test } from "node:test";
import { strict as assert } from "assert";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { approvePattern, validatePendingEntry } from "./catalog-approve";

function makeTmpCatalog(dir: string): string {
  const catalogPath = path.join(dir, "blind-spot-catalog.json");
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({ version: "0.1.0", patterns: [] }, null, 2),
  );
  return catalogPath;
}

function makePendingEntry(
  dir: string,
  overrides: Record<string, unknown> = {},
): string {
  const entry = {
    id: "test-pattern-abc123",
    name: "Test Pattern",
    changeType: "contract-change",
    description: "A test pattern for approval flow testing",
    testPattern: {
      assertType: "field-sent",
      description: "verify field is sent",
    },
    ossEvidence: null,
    provisional: true,
    fixtureRef: null,
    severity: "medium",
    ...overrides,
  };
  const filePath = path.join(dir, "test-pattern-abc123.json");
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  return filePath;
}

test("validatePendingEntry accepts valid entry", () => {
  const result = validatePendingEntry({
    id: "auth-gap-abc",
    name: "Auth Gap",
    changeType: "new-write-endpoint",
    description: "Missing ownership check on new endpoint",
    testPattern: {
      assertType: "call-made",
      description: "verify ownership check",
    },
  });
  assert.ok(result.valid, `Should be valid: ${result.errors}`);
  assert.equal(result.errors.length, 0);
});

test("validatePendingEntry rejects changeType: unknown", () => {
  const result = validatePendingEntry({
    id: "test",
    name: "Test",
    changeType: "unknown",
    description: "test",
    testPattern: { assertType: "call-made", description: "x" },
  });
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("unknown")));
});

test("validatePendingEntry rejects missing required fields", () => {
  const result = validatePendingEntry({ id: "test" });
  assert.ok(!result.valid);
  assert.ok(result.errors.length > 0);
});

test("approvePattern moves file to catalog", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-approve-"));
  try {
    const catalogPath = makeTmpCatalog(tmpDir);
    const pendingFile = makePendingEntry(tmpDir);

    const result = await approvePattern(pendingFile, catalogPath);

    assert.ok(
      result.ok,
      `Should succeed: ${!result.ok ? (result as { reason: string }).reason : ""}`,
    );
    assert.ok(
      !fs.existsSync(pendingFile),
      "Pending file should be removed after approval",
    );

    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    assert.equal(catalog.patterns.length, 1);
    assert.equal(catalog.patterns[0].id, "test-pattern-abc123");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("approvePattern rejects duplicate id", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-dup-"));
  try {
    const catalogPath = makeTmpCatalog(tmpDir);
    const pendingFile1 = makePendingEntry(tmpDir);

    // First approval
    await approvePattern(pendingFile1, catalogPath);

    // Second with same ID — recreate the file since first approval deleted it
    const pendingFile2 = makePendingEntry(tmpDir);
    const result = await approvePattern(pendingFile2, catalogPath);

    assert.ok(!result.ok, "Should fail for duplicate id");
    if (!result.ok) {
      assert.ok(
        result.reason.includes("already exists"),
        `Unexpected reason: ${result.reason}`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("approvePattern dry-run does not modify catalog", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-dry-"));
  try {
    const catalogPath = makeTmpCatalog(tmpDir);
    const pendingFile = makePendingEntry(tmpDir);
    const initialContent = fs.readFileSync(catalogPath, "utf-8");

    const result = await approvePattern(pendingFile, catalogPath, {
      dryRun: true,
    });

    assert.ok(result.ok);
    assert.equal(
      fs.readFileSync(catalogPath, "utf-8"),
      initialContent,
      "Catalog should not change on dry-run",
    );
    assert.ok(
      fs.existsSync(pendingFile),
      "Pending file should remain on dry-run",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});
