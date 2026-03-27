import * as fs from "fs";
import * as path from "path";
import { DiffBlastRadius, FunctionNode } from "../types/pipeline";

export interface GapReport {
  function: FunctionNode;
  testedDirectly: boolean;
  testFiles: string[];
  blindSpotsWithoutCoverage: string[];
}

// Patterns for each blind spot category
const BLIND_SPOT_TEST_PATTERNS: Record<string, RegExp[]> = {
  idempotency: [/idempotenc/i, /duplicate.*post/i, /409/, /idempotencyKey/i],
  auth: [/unauthorized/i, /401/, /forbidden/i, /403/, /requireAuth/i],
  ownership: [/ownership/i, /ownerId/i, /403/, /IDOR/i],
  cascade: [/cascade/i, /deleteAll/i, /cleanup/i, /orphan/i],
  transaction: [/transaction/i, /rollback/i, /atomic/i],
  cache: [/cache\.delete/i, /cache\.clear/i, /invalidat/i],
};

function findTestFiles(projectRoot: string): string[] {
  const results: string[] = [];

  const walkDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(full);
      } else if (
        entry.name.endsWith(".test.ts") ||
        entry.name.endsWith(".test.js") ||
        entry.name.endsWith(".spec.ts") ||
        entry.name.endsWith(".spec.js") ||
        entry.name.includes("_test.") ||
        entry.name.includes("-test.")
      ) {
        results.push(full);
      }
    }
  };

  walkDir(projectRoot);
  return results;
}

function functionMentionedInTest(
  funcNode: FunctionNode,
  testContent: string,
): boolean {
  const funcName = funcNode.functionName;
  const fileName = path
    .basename(funcNode.filePath, ".ts")
    .replace(/\.(test|spec)$/, "");

  // Check for function name mention in test
  if (funcName && funcName !== "(anonymous)" && testContent.includes(funcName))
    return true;

  // Check for file import
  if (testContent.includes(fileName)) return true;

  return false;
}

function detectMissingBlindSpotCoverage(
  testContents: string[],
  changeTypes: string[] = [],
): string[] {
  const missing: string[] = [];

  for (const [spotName, patterns] of Object.entries(BLIND_SPOT_TEST_PATTERNS)) {
    // Only check relevant blind spots based on change types
    const relevant =
      changeTypes.length === 0 ||
      changeTypes.includes("unknown") ||
      (spotName === "idempotency" &&
        changeTypes.some((ct) => ct.includes("write-endpoint"))) ||
      (spotName === "auth" &&
        changeTypes.some(
          (ct) => ct.includes("auth") || ct.includes("write"),
        )) ||
      (spotName === "ownership" &&
        changeTypes.some(
          (ct) => ct.includes("auth") || ct.includes("write"),
        )) ||
      (spotName === "cascade" &&
        changeTypes.some(
          (ct) => ct.includes("cascade") || ct.includes("delete"),
        )) ||
      (spotName === "transaction" &&
        changeTypes.some((ct) => ct.includes("write"))) ||
      (spotName === "cache" &&
        changeTypes.some((ct) => ct.includes("cascade")));

    if (!relevant) continue;

    const hasCoverage = testContents.some((content) =>
      patterns.some((pattern) => pattern.test(content)),
    );

    if (!hasCoverage) {
      missing.push(spotName);
    }
  }

  return missing;
}

export interface AnalyzeOptions {
  projectRoot: string;
  blastRadius: DiffBlastRadius;
  changeTypes?: string[];
}

export function analyzeGaps(options: AnalyzeOptions): GapReport[] {
  const { projectRoot, blastRadius, changeTypes = [] } = options;

  const testFiles = findTestFiles(projectRoot);

  if (testFiles.length === 0) {
    console.warn(
      "[gap-analyzer] no-tests-found — no test files found in project",
    );
  }

  const testContents = testFiles.map((f) => {
    try {
      return fs.readFileSync(f, "utf-8");
    } catch {
      return "";
    }
  });

  const reports: GapReport[] = [];
  const allNodes = [...blastRadius.changed, ...blastRadius.dependents];

  for (const funcNode of allNodes) {
    const matchingTestFiles: string[] = [];

    for (let i = 0; i < testFiles.length; i++) {
      if (functionMentionedInTest(funcNode, testContents[i])) {
        matchingTestFiles.push(testFiles[i]);
      }
    }

    const testedDirectly = matchingTestFiles.length > 0;
    const relevantTestContents = matchingTestFiles.map((f) => {
      try {
        return fs.readFileSync(f, "utf-8");
      } catch {
        return "";
      }
    });

    const blindSpotsWithoutCoverage = detectMissingBlindSpotCoverage(
      relevantTestContents,
      changeTypes,
    );

    reports.push({
      function: funcNode,
      testedDirectly,
      testFiles: matchingTestFiles,
      blindSpotsWithoutCoverage,
    });
  }

  return reports;
}
