import * as fs from "fs";
import * as path from "path";

interface CatalogPattern {
  id: string;
  name: string;
  changeType: string;
  description: string;
  testPattern: {
    assertType: string;
    description: string;
    field?: string;
    value?: unknown;
  };
  ossEvidence: string | null;
  provisional: boolean;
  fixtureRef: string | null;
  severity: string;
}

interface BlindSpotCatalog {
  version: string;
  patterns: CatalogPattern[];
}

type ApproveResult =
  | { ok: true; pattern: CatalogPattern; catalogPath: string }
  | { ok: false; reason: string };

export function validatePendingEntry(entry: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!entry || typeof entry !== "object") {
    return { valid: false, errors: ["Entry must be an object"] };
  }
  const e = entry as Record<string, unknown>;

  for (const field of ["id", "name", "changeType", "description"]) {
    if (!e[field] || typeof e[field] !== "string") {
      errors.push(`Missing or invalid field: ${field}`);
    }
  }

  if (e.changeType === "unknown") {
    errors.push(
      'changeType is "unknown" — set a valid changeType before approving',
    );
  }

  if (!e.testPattern || typeof e.testPattern !== "object") {
    errors.push("Missing testPattern");
  }

  return { valid: errors.length === 0, errors };
}

export async function approvePattern(
  pendingFilePath: string,
  catalogPath: string,
  options: { dryRun?: boolean } = {},
): Promise<ApproveResult> {
  if (!fs.existsSync(pendingFilePath)) {
    return { ok: false, reason: `Pending file not found: ${pendingFilePath}` };
  }

  let pending: unknown;
  try {
    pending = JSON.parse(fs.readFileSync(pendingFilePath, "utf-8"));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `Failed to parse pending file: ${msg}` };
  }

  const { valid, errors } = validatePendingEntry(pending);
  if (!valid) {
    return {
      ok: false,
      reason: `Validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    };
  }

  const pendingEntry = pending as Record<string, unknown>;

  // Strip pending metadata — keep only catalog fields
  const pattern: CatalogPattern = {
    id: pendingEntry.id as string,
    name: pendingEntry.name as string,
    changeType: pendingEntry.changeType as string,
    description: pendingEntry.description as string,
    testPattern: pendingEntry.testPattern as CatalogPattern["testPattern"],
    ossEvidence: (pendingEntry.ossEvidence as string | null) ?? null,
    provisional: true,
    fixtureRef: (pendingEntry.fixtureRef as string | null) ?? null,
    severity: (pendingEntry.severity as string) ?? "medium",
  };

  if (options.dryRun) {
    console.log(
      `[dry-run] Would add pattern "${pattern.id}" to ${catalogPath}`,
    );
    return { ok: true, pattern, catalogPath };
  }

  let catalog: BlindSpotCatalog;
  try {
    catalog = JSON.parse(
      fs.readFileSync(catalogPath, "utf-8"),
    ) as BlindSpotCatalog;
  } catch {
    return { ok: false, reason: `Failed to load catalog at ${catalogPath}` };
  }

  if (catalog.patterns.some((p) => p.id === pattern.id)) {
    return {
      ok: false,
      reason: `Pattern with id "${pattern.id}" already exists in catalog`,
    };
  }

  catalog.patterns.push(pattern);
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  fs.unlinkSync(pendingFilePath);

  console.log(`✓ Pattern "${pattern.id}" added to catalog`);
  console.log(`✓ Removed pending file: ${pendingFilePath}`);

  return { ok: true, pattern, catalogPath };
}

export function testFalsePositive(
  patternId: string,
  catalogPath: string,
): boolean {
  // Stub: full implementation requires pipeline integration (TASK-008+)
  console.log(
    `[catalog test-fp] Running false-positive check for pattern: ${patternId}`,
  );
  console.log(`[catalog test-fp] Catalog: ${catalogPath}`);
  console.log(
    `[catalog test-fp] NOTE: Full implementation requires pipeline integration (TASK-008+)`,
  );
  return true;
}

export async function runCatalogApprove(argv: string[]): Promise<void> {
  const [subcommand, ...rest] = argv;

  if (subcommand === "approve") {
    const filename = rest[0];
    if (!filename) {
      console.error("Usage: optinum catalog approve <filename>");
      process.exit(1);
    }

    const pendingDir = path.join(process.cwd(), "catalog", "pending");
    const pendingFile = path.isAbsolute(filename)
      ? filename
      : path.join(pendingDir, filename);
    const catalogFile = path.join(
      process.cwd(),
      "src",
      "catalog",
      "blind-spot-catalog.json",
    );

    const result = await approvePattern(pendingFile, catalogFile);
    if (!result.ok) {
      console.error(`✗ ${result.reason}`);
      process.exit(1);
    }
    return;
  }

  if (subcommand === "test-fp") {
    const patternId = rest[0];
    if (!patternId) {
      console.error("Usage: optinum catalog test-fp <pattern-id>");
      process.exit(1);
    }
    const catalogFile = path.join(
      process.cwd(),
      "src",
      "catalog",
      "blind-spot-catalog.json",
    );
    testFalsePositive(patternId, catalogFile);
    return;
  }

  console.error(`Unknown catalog subcommand: ${subcommand}`);
  console.error("Available: approve <filename>, test-fp <pattern-id>");
  process.exit(1);
}
