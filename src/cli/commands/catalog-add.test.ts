import { test } from "node:test";
import { strict as assert } from "assert";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { catalogAdd, slugify } from "./catalog-add";

test("slugify converts description to kebab-case id", () => {
  const result = slugify("Auth check missing on new endpoint");
  assert.ok(/^[a-z0-9-]+$/.test(result), `Should be kebab-case: ${result}`);
  assert.ok(!result.includes(" "), "Should not contain spaces");
});

test("catalogAdd creates a pending file", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));

  try {
    const result = await catalogAdd({
      repo: "github.com/user/repo",
      commit: "abc1234567890",
      description: "auth ownership gap test",
      outputDir: tmpDir,
    });

    assert.ok(
      fs.existsSync(result.filePath),
      `File should exist: ${result.filePath}`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("catalogAdd entry has changeType: unknown", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));

  try {
    const { entry } = await catalogAdd({
      repo: "github.com/test/repo",
      commit: "def456",
      description: "test pattern",
      outputDir: tmpDir,
    });

    assert.equal(entry.changeType, "unknown");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("catalogAdd populates repo and commit in ossEvidence", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));

  try {
    const { entry } = await catalogAdd({
      repo: "github.com/myorg/myrepo",
      commit: "cafebabe",
      description: "new pattern",
      outputDir: tmpDir,
    });

    assert.ok(
      entry.ossEvidence?.includes("github.com/myorg/myrepo"),
      "ossEvidence should include repo",
    );
    assert.ok(
      entry.ossEvidence?.includes("cafebabe"),
      "ossEvidence should include commit",
    );
    assert.equal(entry.pending.crossRefConfirmed, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("catalogAdd output is valid JSON", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "optinum-test-"));

  try {
    const { filePath } = await catalogAdd({
      repo: "github.com/test/repo",
      commit: "12345",
      description: "some new pattern found",
      outputDir: tmpDir,
    });

    const content = fs.readFileSync(filePath, "utf-8");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      assert.fail("Output file should be valid JSON");
    }
    assert.ok(parsed.id, "Should have id");
    assert.ok(parsed.provisional === true, "Should be provisional");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});
