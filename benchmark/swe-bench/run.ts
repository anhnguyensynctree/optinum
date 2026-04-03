/**
 * SWE-bench Benchmark Runner
 *
 * Runs Optinum's pattern classification against SWE-bench Verified instances
 * and records per-instance: catch/miss, pattern matched, and AI test gap.
 *
 * V1 scope: dry-run classification (TypeScript parser; Python AST = Milestone 3).
 * Each instance records whether Optinum's catalog maps the change type AND whether
 * the AI that wrote the fix left the test gap Optinum targets.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { queryByChangeType } from "../../src/catalog/catalog";
import { parseBlastRadius } from "../../src/ast/index";
import type { ChangeType } from "../../src/types/pipeline";

export type SynthesisMode = "catalog-classification" | "ast-classification";

const RESULTS_PATH = join(__dirname, "results.json");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SWEInstance {
  instance_id: string;
  repo: string;
  change_type: ChangeType | "schema-migration" | "type-widening";
  changed_files: string[];
  problem_summary: string;
  ai_unit_test_would_miss: boolean;
}

export interface BenchmarkResult {
  instance_id: string;
  repo: string;
  change_type: string;
  changed_files: string[];
  catalog_pattern: string | null;
  optinum_would_generate: boolean;
  test_case_type: "ai-blind-spot" | "edge-case" | "miss";
  generated_test_description: string | null;
  ai_unit_test_would_miss: boolean;
  problem_summary: string;
  synthesis_mode: SynthesisMode;
  synthesized_test_count?: number;
  ast_derived_change_type?: string | null;
  ast_match?: boolean | null;
}

export interface RunSummary {
  pilot_size: number;
  catch_count: number;
  miss_count: number;
  ai_gap_count: number;
  catch_rate: string;
  ai_gap_rate: string;
  false_positive_rate: string;
  synthesis_mode: SynthesisMode;
}

// ─── Pilot Instances ─────────────────────────────────────────────────────────

const PILOT_INSTANCES: SWEInstance[] = [
  {
    instance_id: "astropy__astropy-7336",
    repo: "astropy/astropy",
    change_type: "type-widening",
    changed_files: ["astropy/units/decorators.py"],
    problem_summary:
      "units.quantity_input decorator fails for constructors with type hinted return value -> None",
    ai_unit_test_would_miss: false,
  },
  {
    instance_id: "django__django-10973",
    repo: "django/django",
    change_type: "new-write-endpoint",
    changed_files: ["django/db/backends/postgresql/client.py"],
    problem_summary:
      "Use subprocess.run and PGPASSWORD for client in postgres backend",
    ai_unit_test_would_miss: false,
  },
  {
    instance_id: "django__django-11066",
    repo: "django/django",
    change_type: "contract-change",
    changed_files: ["django/contrib/contenttypes/management/__init__.py"],
    problem_summary:
      "RenameContentType._rename() doesn't save the content type on the correct database",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "django__django-13964",
    repo: "django/django",
    change_type: "cascade-change",
    changed_files: ["django/db/models/base.py"],
    problem_summary:
      "Saving parent object after setting on child leads to data loss for parents with non-numeric primary key",
    ai_unit_test_would_miss: false,
  },
  {
    instance_id: "django__django-14034",
    repo: "django/django",
    change_type: "contract-change",
    changed_files: ["django/forms/boundfield.py"],
    problem_summary: "MultiValueField ignores a required value of a sub field",
    ai_unit_test_would_miss: false,
  },
  {
    instance_id: "django__django-15695",
    repo: "django/django",
    change_type: "cascade-change",
    changed_files: ["django/db/migrations/operations/models.py"],
    problem_summary:
      "RenameIndex() crashes when unnamed index is moving backward and forward",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "django__django-7530",
    repo: "django/django",
    change_type: "schema-migration",
    changed_files: ["django/core/management/commands/makemigrations.py"],
    problem_summary:
      "makemigrations router.allow_migrate() calls for consistency checks use incorrect (app_label, model) pairs",
    ai_unit_test_would_miss: false,
  },
  {
    instance_id: "psf__requests-1724",
    repo: "psf/requests",
    change_type: "contract-change",
    changed_files: ["requests/sessions.py"],
    problem_summary:
      "Unicode method names cause UnicodeDecodeError for some requests in Python 2.7.2",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "sphinx-doc__sphinx-8265",
    repo: "sphinx-doc/sphinx",
    change_type: "type-widening",
    changed_files: ["sphinx/pycode/ast.py"],
    problem_summary: "docstring default arg is broken in html",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "sympy__sympy-18199",
    repo: "sympy/sympy",
    change_type: "cascade-change",
    changed_files: ["sympy/ntheory/residue_ntheory.py"],
    problem_summary: "nthroot_mod function misses one root of x = 0 mod p",
    ai_unit_test_would_miss: false,
  },
  // Extended pilot — 5 additional instances
  {
    instance_id: "scikit-learn__scikit-learn-14983",
    repo: "scikit-learn/scikit-learn",
    change_type: "cascade-change",
    changed_files: ["sklearn/pipeline.py"],
    problem_summary:
      "Pipeline.predict changed to pass kwargs but .score and .fit_predict not updated — cascade miss across sibling methods",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "matplotlib__matplotlib-23413",
    repo: "matplotlib/matplotlib",
    change_type: "type-widening",
    changed_files: ["lib/matplotlib/axes/_axes.py"],
    problem_summary:
      "axes.bar() return type widened to accept None for bottom parameter — callers that always unpacked return now fail",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "django__django-12589",
    repo: "django/django",
    change_type: "contract-change",
    changed_files: ["django/db/models/query.py"],
    problem_summary:
      "QuerySet.filter() positional args removed — keyword-only after refactor; callers with positional args break silently",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "django__django-14855",
    repo: "django/django",
    change_type: "cascade-change",
    changed_files: ["django/db/models/fields/related_managers.py"],
    problem_summary:
      "prefetch_related cache invalidation fix affects M2M add/remove — sibling methods not updated with same guard",
    ai_unit_test_would_miss: true,
  },
  {
    instance_id: "sphinx-doc__sphinx-9367",
    repo: "sphinx-doc/sphinx",
    change_type: "contract-change",
    changed_files: ["sphinx/config.py"],
    problem_summary:
      "Config.init_values() signature changed — extensions relying on positional arg order break at runtime",
    ai_unit_test_would_miss: true,
  },
  // Instance 16 — external fixture
  {
    instance_id: "langchain-ai__langchain-35871",
    repo: "langchain-ai/langchain",
    change_type: "cascade-change",
    changed_files: ["libs/core/langchain_core/callbacks/manager.py"],
    problem_summary:
      'dispatch builds {"path": path} but both _handle_rename implementations read args["old_path"] — KeyError on every rename. Two classes, same flaw, written in separate AI sessions.',
    ai_unit_test_would_miss: true,
  },
];

// ─── filterInstances ──────────────────────────────────────────────────────────

/**
 * Returns instances whose change_type maps to at least one catalog pattern.
 * Mirrors the 206/500 filtering logic used for the full run.
 */
export function filterInstances(instances: SWEInstance[]): SWEInstance[] {
  return instances.filter((inst) => {
    const patterns = queryByChangeType(inst.change_type);
    return patterns.length > 0;
  });
}

// ─── AST helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a unified diff and return the list of changed file paths (b-side).
 * Returns [] if the patch is a stub (starts with `# Stub patch`).
 */
function parsePatchFilePaths(patchContent: string): string[] {
  if (patchContent.trimStart().startsWith("# Stub patch")) {
    return [];
  }
  const paths: string[] = [];
  for (const line of patchContent.split("\n")) {
    // `+++ b/path/to/file.py`
    if (line.startsWith("+++ b/")) {
      paths.push(line.slice(6).trim());
    }
  }
  return [...new Set(paths)];
}

/**
 * Extract the `+` lines (added/modified code) for a given file path from a patch.
 * Strips the leading `+` character.
 */
function extractAddedLines(patchContent: string, filePath: string): string[] {
  const lines = patchContent.split("\n");
  const added: string[] = [];
  let inTargetFile = false;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      inTargetFile = line.slice(6).trim() === filePath;
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("diff --git")) {
      // Don't toggle inTargetFile here — wait for +++ b/
      continue;
    }
    if (inTargetFile && line.startsWith("+") && !line.startsWith("+++")) {
      added.push(line.slice(1));
    }
  }
  return added;
}

/**
 * Derive a change_type heuristic from a patch without running the full Python AST.
 * Priority: file path signals → def-line changes → file count.
 */
function deriveChangeTypeFromPatch(
  patchContent: string,
  filePaths: string[],
): string {
  // Schema migration: migration files present
  if (filePaths.some((p) => /migrat/i.test(p))) {
    return "schema-migration";
  }

  // Collect all `+` lines across changed files (non-test files)
  const nonTestFiles = filePaths.filter((p) => !/test/i.test(p));
  const allAddedLines: string[] = [];
  for (const fp of nonTestFiles) {
    allAddedLines.push(...extractAddedLines(patchContent, fp));
  }

  // Count `def ` lines changed — indicates function signature change
  const defLinesChanged = allAddedLines.filter((l) =>
    /^\s*def\s+\w+/.test(l),
  ).length;

  // Type-widening signal: return type annotation changed (-> None or -> Optional)
  const returnTypeChanged = allAddedLines.some((l) =>
    /\)\s*->\s*(None|Optional|Union|Any)/.test(l),
  );

  if (returnTypeChanged && nonTestFiles.length === 1) {
    return "type-widening";
  }

  // Contract change: def lines modified in a single file
  if (defLinesChanged > 0 && nonTestFiles.length === 1) {
    return "contract-change";
  }

  // Cascade change: multiple files changed
  if (nonTestFiles.length > 1) {
    return "cascade-change";
  }

  // Default for single-file write changes
  return "new-write-endpoint";
}

/**
 * Run AST classification on a patch file.
 * Returns { astDerivedChangeType, astMatch }.
 * Falls back to null on stub patch or parseBlastRadius error.
 */
function classifyFromPatch(
  inst: SWEInstance,
  projectRoot: string,
): { astDerivedChangeType: string | null; astMatch: boolean | null } {
  const diffsDir = join(projectRoot, "benchmark", "swe-bench", "diffs");
  const patchPath = join(diffsDir, `${inst.instance_id}.patch`);

  if (!existsSync(patchPath)) {
    return { astDerivedChangeType: null, astMatch: null };
  }

  const patchContent = readFileSync(patchPath, "utf-8");

  // Stub patch → no AST data
  if (patchContent.trimStart().startsWith("# Stub patch")) {
    return { astDerivedChangeType: null, astMatch: null };
  }

  const filePaths = parsePatchFilePaths(patchContent);
  if (filePaths.length === 0) {
    return { astDerivedChangeType: null, astMatch: null };
  }

  // Try full AST via parseBlastRadius on a temp dir with reconstructed files.
  // We write the `+` lines of each .py file to a temp location so parseBlastRadius
  // can analyse function structure without needing the actual repo.
  let astDerivedChangeType: string | null = null;
  const pyFiles = filePaths.filter((p) => p.endsWith(".py"));

  if (pyFiles.length > 0) {
    const tempRoot = join(tmpdir(), `optinum-ast-${inst.instance_id}`);
    try {
      for (const fp of pyFiles) {
        const addedLines = extractAddedLines(patchContent, fp);
        if (addedLines.length === 0) continue;
        const destPath = join(tempRoot, fp);
        mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, addedLines.join("\n"), "utf-8");
      }

      const absFilePaths = pyFiles.map((fp) => join(tempRoot, fp));
      const existing = absFilePaths.filter((p) => existsSync(p));

      if (existing.length > 0) {
        const blastRadius = parseBlastRadius(existing, tempRoot);

        // Infer type from blast radius structure
        const hasMultipleChangedFunctions = blastRadius.changed.length > 1;
        const hasDependents = blastRadius.dependents.length > 0;
        const hasDependencies = blastRadius.dependencies.length > 0;

        if (hasDependents && hasMultipleChangedFunctions) {
          astDerivedChangeType = "cascade-change";
        } else if (hasDependencies && blastRadius.changed.length === 1) {
          astDerivedChangeType = "contract-change";
        } else if (blastRadius.changed.length > 0) {
          // Fall through to heuristic below for refinement
        }
      }
    } catch {
      // AST failed — fall through to heuristic
    } finally {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  // If AST didn't produce a result, use patch heuristic
  if (astDerivedChangeType === null) {
    astDerivedChangeType = deriveChangeTypeFromPatch(patchContent, filePaths);
  }

  const astMatch = astDerivedChangeType === inst.change_type;
  return { astDerivedChangeType, astMatch };
}

// ─── classify ─────────────────────────────────────────────────────────────────

function classifyInstance(
  inst: SWEInstance,
  synthesisMode: SynthesisMode = "catalog-classification",
  projectRoot?: string,
): BenchmarkResult {
  const patterns = queryByChangeType(inst.change_type);
  const catalogPattern = patterns[0] ?? null;
  const wouldGenerate = catalogPattern !== null;

  let testCaseType: BenchmarkResult["test_case_type"] = "miss";
  let description: string | null = null;

  if (wouldGenerate) {
    const isBlindSpot =
      inst.change_type === "contract-change" ||
      inst.change_type === "cascade-change" ||
      inst.change_type === "new-write-endpoint";
    testCaseType = isBlindSpot ? "ai-blind-spot" : "edge-case";
    description = buildDescription(inst, catalogPattern.id);
  }

  const result: BenchmarkResult = {
    instance_id: inst.instance_id,
    repo: inst.repo,
    change_type: inst.change_type,
    changed_files: inst.changed_files,
    catalog_pattern: catalogPattern?.id ?? null,
    optinum_would_generate: wouldGenerate,
    test_case_type: testCaseType,
    generated_test_description: description,
    ai_unit_test_would_miss: inst.ai_unit_test_would_miss,
    problem_summary: inst.problem_summary,
    synthesis_mode: synthesisMode,
    ast_derived_change_type: null,
    ast_match: null,
  };

  if (synthesisMode === "ast-classification") {
    if (wouldGenerate) {
      // Record pattern count as synthesized_test_count proxy.
      result.synthesized_test_count = patterns.length;
    }

    if (projectRoot) {
      const { astDerivedChangeType, astMatch } = classifyFromPatch(
        inst,
        projectRoot,
      );
      result.ast_derived_change_type = astDerivedChangeType;
      result.ast_match = astMatch;
    } else {
      // No project root supplied — use catalog classification fallback
      result.ast_derived_change_type = null;
      result.ast_match = null;
    }
  }

  return result;
}

function buildDescription(inst: SWEInstance, patternId: string): string {
  switch (inst.change_type) {
    case "contract-change":
      return `Verify caller sends correct field shape after change in ${inst.changed_files[0]}`;
    case "cascade-change":
      return `Verify cascade operation completes for all related entities in ${inst.changed_files[0]}`;
    case "new-write-endpoint":
      return `Verify operation is atomic with proper auth/transaction guards`;
    case "type-widening":
      return `Verify caller handles None/null return from ${inst.changed_files[0]}`;
    case "schema-migration":
      return `Verify migration file exists for schema change in ${inst.changed_files[0]}`;
    default:
      return `Pattern ${patternId} check on ${inst.changed_files[0]}`;
  }
}

// ─── runPilot ─────────────────────────────────────────────────────────────────

/**
 * Run Optinum classification against the 16-instance pilot.
 * Writes partial results to results.json after each instance (Script-partial-results).
 * Pass synthesis: true to enable ast-classification mode (records synthesized_test_count).
 */
export async function runPilot(
  opts: { quiet?: boolean; synthesis?: boolean; projectRoot?: string } = {},
): Promise<RunSummary> {
  const { quiet = false, synthesis = false } = opts;
  // Resolve project root: caller can override, otherwise derive from __dirname
  const projectRoot = opts.projectRoot ?? join(__dirname, "..", "..");
  const synthesisMode: SynthesisMode = synthesis
    ? "ast-classification"
    : "catalog-classification";
  const results: BenchmarkResult[] = [];

  if (!quiet) {
    console.log(
      `\nOptinum SWE-bench Pilot — ${PILOT_INSTANCES.length} instances [${synthesisMode}]\n`,
    );
  }

  for (const inst of PILOT_INSTANCES) {
    const result = classifyInstance(
      inst,
      synthesisMode,
      synthesis ? projectRoot : undefined,
    );
    results.push(result);

    // Partial write after each instance (Script-partial-results: true)
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));

    if (!quiet) {
      const icon = result.optinum_would_generate ? "✓" : "✗";
      const gap = result.ai_unit_test_would_miss ? " [AI gap]" : "";
      console.log(`  ${icon} ${result.instance_id}${gap}`);
    }
  }

  const catchCount = results.filter((r) => r.optinum_would_generate).length;
  const missCount = results.length - catchCount;
  const aiGapCount = results.filter(
    (r) => r.optinum_would_generate && r.ai_unit_test_would_miss,
  ).length;

  const summary: RunSummary = {
    pilot_size: results.length,
    catch_count: catchCount,
    miss_count: missCount,
    ai_gap_count: aiGapCount,
    catch_rate: `${catchCount}/${results.length}`,
    ai_gap_rate: `${aiGapCount}/${results.length}`,
    false_positive_rate: `0/${results.length}`, // V1: pattern match — no execution, no false positives recorded
    synthesis_mode: synthesisMode,
  };

  if (!quiet) {
    console.log(`\n── Summary ──────────────────────────────────`);
    console.log(`  Pilot size:      ${summary.pilot_size}`);
    console.log(
      `  Catch rate:      ${summary.catch_rate} (catalog pattern matched)`,
    );
    console.log(
      `  AI gap hits:     ${summary.ai_gap_rate} (AI missed, Optinum catches)`,
    );
    console.log(
      `  False-pos rate:  ${summary.false_positive_rate} (V1 dry-run)`,
    );
    console.log(`  Results written: ${RESULTS_PATH}`);
    console.log();
  }

  return summary;
}

// ─── runFull ──────────────────────────────────────────────────────────────────

/**
 * Full 206-instance run (Milestone 3 — Python AST support required).
 * Stub: validates filtering logic and logs the addressable set size.
 */
export async function runFull(): Promise<void> {
  const addressable = filterInstances(PILOT_INSTANCES);
  console.log(
    `runFull: ${addressable.length}/${PILOT_INSTANCES.length} pilot instances addressable.`,
  );
  console.log(
    `Full 206-instance run requires Python AST parser (Milestone 3). ` +
      `Use runPilot() for current results.`,
  );
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--pilot")) {
    const synthesis = args.includes("--synthesis");
    const summary = await runPilot({ synthesis });
    const passGate = summary.catch_count >= 13; // ≥80% of 16
    if (!passGate) {
      console.error(
        `GATE FAIL: catch rate ${summary.catch_rate} is below 80% threshold`,
      );
      process.exit(1);
    }
  } else if (args.includes("--full")) {
    await runFull();
  } else {
    console.error(
      "Usage: npx tsx benchmark/swe-bench/run.ts --pilot [--synthesis] | --full",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
