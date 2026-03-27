import * as assert from "node:assert/strict";
import { test, describe } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

const SEED_REPOS_PATH = path.join(__dirname, "seed-repos.json");

interface SeedRepo {
  slug: string;
  repoUrl: string;
  language: string;
  description: string;
  suggestedRange: string;
}

const REQUIRED_FIELDS: Array<keyof SeedRepo> = [
  "slug",
  "repoUrl",
  "language",
  "description",
  "suggestedRange",
];

describe("seed-repos.json", () => {
  let repos: SeedRepo[];

  test("file exists and is valid JSON", () => {
    assert.ok(
      fs.existsSync(SEED_REPOS_PATH),
      `seed-repos.json not found at ${SEED_REPOS_PATH}`,
    );
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    assert.ok(Array.isArray(repos), "seed-repos.json must be a JSON array");
  });

  test("has exactly 5 entries", () => {
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    assert.strictEqual(
      repos.length,
      5,
      `expected 5 repos, got ${repos.length}`,
    );
  });

  test("each entry has all required fields", () => {
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    for (const repo of repos) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(
          typeof repo[field] === "string" && repo[field].length > 0,
          `repo slug="${repo.slug ?? "(unknown)"}" is missing or empty field: ${field}`,
        );
      }
    }
  });

  test("no duplicate slugs", () => {
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    const slugs = repos.map((r) => r.slug);
    const unique = new Set(slugs);
    assert.strictEqual(
      unique.size,
      slugs.length,
      `duplicate slugs found: ${slugs.filter((s, i) => slugs.indexOf(s) !== i).join(", ")}`,
    );
  });

  test("no duplicate repoUrls", () => {
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    const urls = repos.map((r) => r.repoUrl);
    const unique = new Set(urls);
    assert.strictEqual(
      unique.size,
      urls.length,
      `duplicate repoUrls found: ${urls.filter((u, i) => urls.indexOf(u) !== i).join(", ")}`,
    );
  });

  test("suggestedRange has valid <from>..<to> format", () => {
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    for (const repo of repos) {
      const parts = repo.suggestedRange.split("..");
      assert.strictEqual(
        parts.length,
        2,
        `repo "${repo.slug}" suggestedRange "${repo.suggestedRange}" must be <from>..<to>`,
      );
      assert.ok(
        parts[0].length > 0,
        `repo "${repo.slug}" suggestedRange has empty fromCommit`,
      );
      assert.ok(
        parts[1].length > 0,
        `repo "${repo.slug}" suggestedRange has empty toCommit`,
      );
    }
  });

  test("language is TypeScript or Python", () => {
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    const allowed = new Set(["TypeScript", "Python"]);
    for (const repo of repos) {
      assert.ok(
        allowed.has(repo.language),
        `repo "${repo.slug}" has invalid language "${repo.language}" — must be TypeScript or Python`,
      );
    }
  });

  test("has 3 TypeScript and 2 Python repos", () => {
    const raw = fs.readFileSync(SEED_REPOS_PATH, "utf-8");
    repos = JSON.parse(raw) as SeedRepo[];
    const tsCount = repos.filter((r) => r.language === "TypeScript").length;
    const pyCount = repos.filter((r) => r.language === "Python").length;
    assert.strictEqual(
      tsCount,
      3,
      `expected 3 TypeScript repos, got ${tsCount}`,
    );
    assert.strictEqual(pyCount, 2, `expected 2 Python repos, got ${pyCount}`);
  });
});
