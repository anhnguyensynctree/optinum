import * as fs from "fs";
import * as path from "path";
import { parseBlastRadius } from "../../ast/ts-parser";
import { detectSchemas } from "../../schema/ts-schema-detector";
import { classifyChange } from "../../classifier/change-classifier";
import * as synthesizerModule from "../../synthesizer/synthesizer";
import type { SynthesisMode } from "../../synthesizer/synthesizer";
import type { SynthesizedTest } from "../../types/pipeline";

export type RunnerType = "jest" | "vitest";

export interface TestCommandFlags {
  diff?: string | boolean;
  output?: string | boolean;
  "dry-run"?: boolean;
  runner?: string | boolean;
  llm?: string | boolean;
  /** Injectable for testing — overrides synthesizeTests call */
  _synthesize?: typeof import("../../synthesizer/synthesizer").synthesizeTests;
}

function extractTsFilesFromDiffDir(diffDir: string): string[] {
  const afterDir = path.join(diffDir, "after");
  if (!fs.existsSync(afterDir)) return [];
  return collectTsFiles(afterDir);
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      results.push(full);
    }
  }
  return results;
}

function extractTsFilesFromDiffFile(diffPath: string): string[] {
  const content = fs.readFileSync(diffPath, "utf8");
  const lines = content.split("\n");
  const files = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^(?:\+\+\+|---)\s+(?:a\/|b\/)?(.+\.tsx?)$/);
    if (match) {
      const fp = match[1].trim();
      if (!fp.endsWith(".test.ts") && !fp.endsWith(".test.tsx")) {
        files.add(fp);
      }
    }
  }
  return Array.from(files);
}

function renderTestFile(tests: SynthesizedTest[], runner: RunnerType): string {
  const importLine =
    runner === "vitest"
      ? 'import { describe, it, expect } from "vitest";'
      : "// jest globals available — no import needed";

  const itBlocks = tests
    .map((t) => {
      const payloadJson = JSON.stringify(t.payload, null, 6)
        .split("\n")
        .join("\n    ");
      return `  it("${t.testId} — ${t.caseType}: ${t.endpoint}", async () => {
    const res = await fetch("${t.endpoint}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(${payloadJson}),
    });
    expect(res.status).toBe(${t.expectedStatus});
  });`;
    })
    .join("\n\n");

  return `${importLine}

describe("optinum generated tests", () => {
${itBlocks}
});
`;
}

function summarizeCounts(tests: SynthesizedTest[]): {
  happy: number;
  edge: number;
  blindSpot: number;
} {
  let happy = 0;
  let edge = 0;
  let blindSpot = 0;
  for (const t of tests) {
    if (t.caseType === "happy") happy++;
    else if (t.caseType === "ai-blind-spot") blindSpot++;
    else edge++;
  }
  return { happy, edge, blindSpot };
}

function resolveMode(llmFlag: string | boolean | undefined): SynthesisMode {
  if (llmFlag === "api") return "api";
  return "cli";
}

function resolveRunner(runnerFlag: string | boolean | undefined): RunnerType {
  if (runnerFlag === "vitest") return "vitest";
  return "jest";
}

export async function runTestCommand(flags: TestCommandFlags): Promise<void> {
  const diffArg = flags["diff"];
  const outputDir =
    typeof flags["output"] === "string" ? flags["output"] : "./optinum-tests";
  const dryRun = flags["dry-run"] === true;
  const runner = resolveRunner(flags["runner"]);
  const mode = resolveMode(flags["llm"]);
  const synthesize = flags["_synthesize"] ?? synthesizerModule.synthesizeTests;

  // Config check: require .optinum.json unless --diff is explicitly provided
  const configPath = path.resolve(process.cwd(), ".optinum.json");
  if (!diffArg && !fs.existsSync(configPath)) {
    console.error("Run `optinum init` first");
    process.exit(1);
  }

  if (!diffArg) {
    console.error("--diff <path> is required");
    process.exit(1);
  }

  const diffPath = typeof diffArg === "string" ? diffArg : "";
  if (!diffPath) {
    console.error("--diff requires a path argument");
    process.exit(1);
  }

  const resolvedDiff = path.resolve(process.cwd(), diffPath);
  if (!fs.existsSync(resolvedDiff)) {
    console.error(`Diff path not found: ${resolvedDiff}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedDiff);
  let changedFiles: string[];
  let projectRoot: string;

  if (stat.isDirectory()) {
    changedFiles = extractTsFilesFromDiffDir(resolvedDiff);
    projectRoot = path.join(resolvedDiff, "after");
  } else {
    changedFiles = extractTsFilesFromDiffFile(resolvedDiff);
    projectRoot = process.cwd();
  }

  if (changedFiles.length === 0) {
    console.log("No TypeScript files detected in diff — nothing to do.");
    return;
  }

  const blastRadius = parseBlastRadius({ projectRoot, changedFiles });
  const contracts = detectSchemas(changedFiles, projectRoot);
  const changeTypes = classifyChange(blastRadius);
  const result = await synthesize({
    blastRadius,
    contracts,
    changeTypes,
    mode,
  });

  if (result.error) {
    console.error(
      `[synthesizer] ${result.error.stage}: ${result.error.message}`,
    );
    process.exit(1);
  }

  const tests = result.tests;
  const counts = summarizeCounts(tests);
  console.log(
    `${tests.length} tests generated (${counts.happy} happy, ${counts.edge} edge, ${counts.blindSpot} ai-blind-spot)`,
  );

  if (dryRun) {
    console.log(renderTestFile(tests, runner));
    return;
  }

  const absOutputDir = path.resolve(process.cwd(), outputDir);
  fs.mkdirSync(absOutputDir, { recursive: true });

  const outFile = path.join(absOutputDir, "generated.test.ts");
  fs.writeFileSync(outFile, renderTestFile(tests, runner), "utf8");
  console.log(`Written: ${outFile}`);
}
