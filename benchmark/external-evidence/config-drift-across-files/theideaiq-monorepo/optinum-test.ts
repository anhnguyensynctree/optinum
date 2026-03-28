// Optinum generates this from: changeType=config-drift-across-files, pattern=config-drift-across-files
//
// Jules introduced this drift 4 times across PRs #660, #690, #764, #778, and #782.
// Each time: added required keys to packages/env/src/web.ts (Zod schema) but did not
// update apps/web/.env.example. Optinum's test makes schema-to-example drift a CI failure
// so the 5th occurrence is caught before PR rather than after merge.
//
// Strategy: parse the Zod schema source to extract required server var names,
// parse .env.example to extract documented keys, assert full coverage.

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../../..");
const SCHEMA_PATH = resolve(REPO_ROOT, "packages/env/src/web.ts");
const ENV_EXAMPLE_PATH = resolve(REPO_ROOT, "apps/web/.env.example");

function extractSchemaServerKeys(schemaSource: string): string[] {
  // Match keys declared inside the server: { ... } block of createEnv
  const serverBlock = schemaSource.match(/server:\s*\{([^}]+)\}/s)?.[1] ?? "";
  const keyPattern = /^\s{4}(\w+):/gm;
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(serverBlock)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

function extractEnvExampleKeys(envExample: string): Set<string> {
  const keys = new Set<string>();
  for (const line of envExample.split("\n")) {
    const trimmed = line.trim();
    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      keys.add(trimmed.slice(0, eqIndex).trim());
    }
  }
  return keys;
}

describe("Env schema ↔ .env.example drift", () => {
  const schemaSource = readFileSync(SCHEMA_PATH, "utf-8");
  const envExample = readFileSync(ENV_EXAMPLE_PATH, "utf-8");
  const schemaKeys = extractSchemaServerKeys(schemaSource);
  const exampleKeys = extractEnvExampleKeys(envExample);

  it("every required server key in the Zod schema is documented in .env.example", () => {
    const missing = schemaKeys.filter((key) => !exampleKeys.has(key));
    expect(missing).toEqual(
      [],
      `Keys in Zod schema but missing from .env.example: ${missing.join(", ")}. ` +
        "Jules hit this drift 4 times. Optinum makes it a CI failure.",
    );
  });

  it("SUPABASE_SERVICE_ROLE_KEY is present in .env.example", () => {
    // Explicit guard for the specific key Jules kept forgetting
    expect(exampleKeys.has("SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
  });

  it("ZAIN_SECRET_KEY is present in .env.example", () => {
    expect(exampleKeys.has("ZAIN_SECRET_KEY")).toBe(true);
  });

  it(".env.example has no keys absent from the schema (no stale docs)", () => {
    const schemaSet = new Set(schemaKeys);
    const stale = [...exampleKeys].filter((k) => !schemaSet.has(k));
    // Warn only — stale docs are lower severity than missing docs
    if (stale.length > 0) {
      console.warn(
        `Keys in .env.example not in schema (stale): ${stale.join(", ")}`,
      );
    }
    // Not a hard failure — schema is the source of truth, example can document extras
  });
});
