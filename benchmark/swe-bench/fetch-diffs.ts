/**
 * fetch-diffs.ts
 *
 * Downloads fix patches for each SWE-bench Verified pilot instance from HuggingFace.
 * Writes each patch to benchmark/swe-bench/diffs/<instance_id>.patch.
 *
 * Usage: npx tsx benchmark/swe-bench/fetch-diffs.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const DIFFS_DIR = join(__dirname, "diffs");

const INSTANCE_IDS: string[] = [
  "astropy__astropy-7336",
  "django__django-10973",
  "django__django-11066",
  "django__django-13964",
  "django__django-14034",
  "django__django-15695",
  "django__django-7530",
  "psf__requests-1724",
  "sphinx-doc__sphinx-8265",
  "sympy__sympy-18199",
  "scikit-learn__scikit-learn-14983",
  "matplotlib__matplotlib-23413",
  "django__django-12589",
  "django__django-14855",
  "sphinx-doc__sphinx-9367",
  "langchain-ai__langchain-35871",
];

const HF_BASE_URL =
  "https://datasets-server.huggingface.co/rows" +
  "?dataset=princeton-nlp%2FSWE-bench_Verified" +
  "&config=default" +
  "&split=test";

const HF_PAGE_SIZE = 100; // max allowed by HF API

interface HFRow {
  row_idx: number;
  row: {
    instance_id: string;
    patch: string;
    [key: string]: unknown;
  };
  truncated_cells: string[];
}

interface HFResponse {
  rows: HFRow[];
  num_rows_total?: number;
  num_rows_per_page?: number;
}

function writeStubPatch(instanceId: string): void {
  const content =
    `# Stub patch — HF API unavailable during fetch\n` +
    `# instance_id: ${instanceId}\n`;
  const outPath = join(DIFFS_DIR, `${instanceId}.patch`);
  writeFileSync(outPath, content, "utf-8");
}

async function fetchPage(offset: number): Promise<HFResponse> {
  const url = `${HF_BASE_URL}&offset=${offset}&length=${HF_PAGE_SIZE}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (!res.ok) {
    throw new Error(
      `HF API responded ${res.status} ${res.statusText} (offset=${offset})`,
    );
  }

  const data = (await res.json()) as HFResponse;

  if (!Array.isArray(data.rows)) {
    throw new Error(`HF API response missing 'rows' array at offset=${offset}`);
  }

  return data;
}

async function fetchAllRows(): Promise<HFRow[]> {
  // First page — also tells us num_rows_total
  const first = await fetchPage(0);
  const total = first.num_rows_total ?? first.rows.length;
  const allRows: HFRow[] = [...first.rows];

  const pageCount = Math.ceil(total / HF_PAGE_SIZE);
  for (let page = 1; page < pageCount; page++) {
    const offset = page * HF_PAGE_SIZE;
    const data = await fetchPage(offset);
    allRows.push(...data.rows);
  }

  return allRows;
}

async function main(): Promise<void> {
  mkdirSync(DIFFS_DIR, { recursive: true });

  let rows: HFRow[];
  try {
    console.log("Fetching SWE-bench Verified rows from HuggingFace...");
    rows = await fetchAllRows();
    console.log(`  Retrieved ${rows.length} rows\n`);
  } catch (err) {
    console.error(
      `Network failure: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error("Writing stub patch files for all instances...");
    for (const id of INSTANCE_IDS) {
      writeStubPatch(id);
      console.error(`  stub: ${id}`);
    }
    process.exit(1);
  }

  // Build a lookup map for O(1) access
  const patchMap = new Map<string, string>();
  for (const { row } of rows) {
    if (row.instance_id && typeof row.patch === "string") {
      patchMap.set(row.instance_id, row.patch);
    }
  }

  let foundCount = 0;
  let missingCount = 0;

  for (const instanceId of INSTANCE_IDS) {
    const patch = patchMap.get(instanceId);
    const outPath = join(DIFFS_DIR, `${instanceId}.patch`);

    if (patch !== undefined && patch.trim().length > 0) {
      writeFileSync(outPath, patch, "utf-8");
      console.log(`✓ ${instanceId}`);
      foundCount++;
    } else {
      // Write stub so downstream tasks don't break on missing files
      writeStubPatch(instanceId);
      console.log(`✗ ${instanceId} — not found`);
      missingCount++;
    }
  }

  console.log(
    `\nDone — ${foundCount} fetched, ${missingCount} stubbed → ${DIFFS_DIR}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
