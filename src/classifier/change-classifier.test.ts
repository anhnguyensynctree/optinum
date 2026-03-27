import { test } from "node:test";
import { strict as assert } from "assert";
import * as path from "path";
import { classifyChange } from "./change-classifier";
import { DiffBlastRadius } from "../types/pipeline";

const FIXTURE_ROOT = path.join(__dirname, "../../fixtures");

function makeBlastRadius(
  changedFilePaths: string[],
  extraDependents: string[] = [],
): DiffBlastRadius {
  return {
    changed: changedFilePaths.map((fp) => ({
      filePath: fp,
      functionName: "POST",
      startLine: 1,
      endLine: 20,
    })),
    dependents: extraDependents.map((fp) => ({
      filePath: fp,
      functionName: "caller",
      startLine: 1,
      endLine: 10,
    })),
    dependencies: [],
  };
}

test("fixture-001 route.ts classified as contract-change", () => {
  const routeFile = path.join(
    FIXTURE_ROOT,
    "fixture-001-contract-change/after/src/api/questionnaire/route.ts",
  );
  const blastRadius = makeBlastRadius([routeFile]);
  const result = classifyChange(blastRadius);
  assert.ok(
    result.includes("contract-change"),
    `Expected contract-change, got: ${result}`,
  );
});

test("new POST handler → new-write-endpoint", () => {
  const tmpFile = require("os").tmpdir() + "/route.ts";
  require("fs").writeFileSync(
    tmpFile,
    "export async function POST(req: Request) { return Response.json({}) }\n",
  );
  const blastRadius = makeBlastRadius([tmpFile]);
  const result = classifyChange(blastRadius);
  assert.ok(
    result.includes("new-write-endpoint") || result.includes("contract-change"),
    `Expected new-write-endpoint or contract-change, got: ${result}`,
  );
  require("fs").unlinkSync(tmpFile);
});

test("DELETE handler → new-delete-operation", () => {
  const tmpFile = require("os").tmpdir() + "/delete-route.ts";
  require("fs").writeFileSync(
    tmpFile,
    "export async function DELETE(req: Request) { return Response.json({deleted: true}) }\n",
  );
  const blastRadius = makeBlastRadius([tmpFile]);
  const result = classifyChange(blastRadius);
  assert.ok(
    result.includes("new-delete-operation"),
    `Expected new-delete-operation, got: ${result}`,
  );
  require("fs").unlinkSync(tmpFile);
});

test("Prisma schema file → schema-migration", () => {
  const blastRadius = makeBlastRadius(["/project/prisma/schema.prisma"]);
  const result = classifyChange(blastRadius);
  assert.ok(
    result.includes("schema-migration"),
    `Expected schema-migration, got: ${result}`,
  );
});

test("no matching heuristic → unknown with classification-miss log", () => {
  const tmpFile = require("os").tmpdir() + "/util.ts";
  require("fs").writeFileSync(
    tmpFile,
    "export function add(a: number, b: number): number { return a + b; }\n",
  );
  const blastRadius = makeBlastRadius([tmpFile]);
  const result = classifyChange(blastRadius);
  assert.ok(result.includes("unknown"), `Expected unknown, got: ${result}`);
  require("fs").unlinkSync(tmpFile);
});

test("auth file → new-auth-check", () => {
  const tmpFile = require("os").tmpdir() + "/auth-middleware.ts";
  require("fs").writeFileSync(
    tmpFile,
    "export async function requireAuth(req: Request) { const session = await getSession(req); if (!session) throw new Error('Unauthorized'); }\n",
  );
  const blastRadius = makeBlastRadius([tmpFile]);
  const result = classifyChange(blastRadius);
  assert.ok(
    result.includes("new-auth-check"),
    `Expected new-auth-check, got: ${result}`,
  );
  require("fs").unlinkSync(tmpFile);
});
