import * as fs from "fs";
import * as path from "path";
import { parseBlastRadius } from "../../ast/index";
import { synthesizeTests } from "../../synthesizer/synthesizer";
import type { SynthesizedTest } from "../../types/pipeline";

// ---------------------------------------------------------------------------
// Diff file extraction — TypeScript
// ---------------------------------------------------------------------------

export function extractTsFilesFromDiffFile(diffPath: string): string[] {
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

export function extractTsFilesFromDiffDir(diffDir: string): string[] {
  const afterDir = path.join(diffDir, "after");
  if (!fs.existsSync(afterDir)) return [];
  return walkForExtension(afterDir, [".ts", ".tsx"], [".test.ts", ".test.tsx"]);
}

// ---------------------------------------------------------------------------
// Diff file extraction — Python
// ---------------------------------------------------------------------------

export function extractPyFilesFromDiffFile(diffPath: string): string[] {
  const content = fs.readFileSync(diffPath, "utf8");
  const lines = content.split("\n");
  const files = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^(?:\+\+\+|---)\s+(?:a\/|b\/)?(.+\.py)$/);
    if (match) {
      const fp = match[1].trim();
      const basename = path.basename(fp);
      if (!basename.endsWith("_test.py") && !basename.startsWith("test_")) {
        files.add(fp);
      }
    }
  }
  return Array.from(files);
}

export function extractPyFilesFromDiffDir(diffDir: string): string[] {
  const afterDir = path.join(diffDir, "after");
  if (!fs.existsSync(afterDir)) return [];
  return walkForExtension(afterDir, [".py"], ["_test.py"], ["test_"]);
}

// ---------------------------------------------------------------------------
// Ecosystem detection
// ---------------------------------------------------------------------------

export function detectEcosystem(
  changedFiles: string[],
): "python" | "typescript" {
  const hasPy = changedFiles.some((f) => f.endsWith(".py"));
  return hasPy ? "python" : "typescript";
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export function renderPytestFile(tests: SynthesizedTest[]): string {
  const lines: string[] = [
    "import httpx",
    "import pytest",
    "",
    'BASE_URL = "http://localhost:8000"',
    "",
  ];

  for (const t of tests) {
    const slug = t.endpoint.replace(/[/\-]/g, "_").replace(/^_/, "");
    const name = `test_${t.testId}_${t.caseType}_${slug}`;

    if (t.caseType === "ai-blind-spot" && t.blindSpotPattern) {
      lines.push(`# ${t.blindSpotPattern}`);
    }

    lines.push(`def ${name}():`);

    const hasPayload = Object.keys(t.payload).length > 0;
    if (hasPayload) {
      const payloadJson = JSON.stringify(t.payload);
      lines.push(
        `    resp = httpx.post(f"{BASE_URL}${t.endpoint}", json=${payloadJson})`,
      );
    } else {
      lines.push(`    resp = httpx.get(f"{BASE_URL}${t.endpoint}")`);
    }

    lines.push(`    assert resp.status_code == ${t.expectedStatus}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderTestFile(tests: SynthesizedTest[]): string {
  const lines: string[] = [
    `import { describe, it, expect } from "vitest";`,
    "",
  ];

  for (const t of tests) {
    lines.push(`describe("${t.testId} — ${t.caseType}", () => {`);
    lines.push(
      `  it("${t.endpoint} returns ${t.expectedStatus}", async () => {`,
    );

    const hasPayload = Object.keys(t.payload).length > 0;
    if (hasPayload) {
      lines.push(
        `    const res = await fetch("${t.endpoint}", { method: "POST", body: JSON.stringify(${JSON.stringify(t.payload)}), headers: { "Content-Type": "application/json" } });`,
      );
    } else {
      lines.push(`    const res = await fetch("${t.endpoint}");`);
    }

    lines.push(`    expect(res.status).toBe(${t.expectedStatus});`);
    lines.push(`  });`);
    lines.push(`});`);
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function runTestCommand(args: {
  diff?: string;
  diffDir?: string;
  projectRoot?: string;
  outDir?: string;
}): Promise<void> {
  const {
    diff,
    diffDir,
    projectRoot = process.cwd(),
    outDir = "optinum-tests",
  } = args;

  // Collect changed files by language
  let tsFiles: string[] = [];
  let pyFiles: string[] = [];

  if (diff) {
    tsFiles = extractTsFilesFromDiffFile(diff);
    pyFiles = extractPyFilesFromDiffFile(diff);
  } else if (diffDir) {
    tsFiles = extractTsFilesFromDiffDir(diffDir);
    pyFiles = extractPyFilesFromDiffDir(diffDir);
  }

  const allFiles = [...tsFiles, ...pyFiles];

  if (allFiles.length === 0) {
    process.stdout.write(
      "No Python or TypeScript files detected in the diff. Nothing to do.\n",
    );
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  const hasPy = pyFiles.length > 0;
  const hasTs = tsFiles.length > 0;

  // Run TypeScript pipeline
  if (hasTs) {
    const blastRadius = parseBlastRadius({
      projectRoot,
      changedFiles: tsFiles,
    });
    const result = await synthesizeTests({
      blastRadius,
      contracts: [],
      changeTypes: ["unknown"],
    });

    const outPath = path.join(outDir, "generated.test.ts");
    fs.writeFileSync(outPath, renderTestFile(result.tests), "utf8");
    process.stdout.write(`TypeScript tests written to ${outPath}\n`);
  }

  // Run Python pipeline
  if (hasPy) {
    const blastRadius = parseBlastRadius({
      projectRoot,
      changedFiles: pyFiles,
    });
    const result = await synthesizeTests({
      blastRadius,
      contracts: [],
      changeTypes: ["unknown"],
    });

    const outPath = path.join(outDir, "generated_test.py");
    fs.writeFileSync(outPath, renderPytestFile(result.tests), "utf8");
    process.stdout.write(`Python tests written to ${outPath}\n`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkForExtension(
  dir: string,
  extensions: string[],
  excludeSuffixes: string[],
  excludePrefixes: string[] = [],
): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(
        ...walkForExtension(full, extensions, excludeSuffixes, excludePrefixes),
      );
    } else if (
      extensions.some((ext) => entry.name.endsWith(ext)) &&
      !excludeSuffixes.some((s) => entry.name.endsWith(s)) &&
      !excludePrefixes.some((p) => entry.name.startsWith(p))
    ) {
      results.push(full);
    }
  }
  return results;
}
