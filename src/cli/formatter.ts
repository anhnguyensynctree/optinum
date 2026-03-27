import type {
  PipelineResult,
  PipelineError,
  SynthesizedTest,
} from "../types/pipeline";

export interface FormatOptions {
  json?: boolean;
}

type CaseType = "happy" | "edge" | "ai-blind-spot";

interface EndpointRow {
  endpoint: string;
  happy: number;
  edge: number;
  blindSpot: number;
  total: number;
}

function buildEndpointRows(tests: SynthesizedTest[]): EndpointRow[] {
  const map = new Map<string, EndpointRow>();

  for (const t of tests) {
    if (!map.has(t.endpoint)) {
      map.set(t.endpoint, {
        endpoint: t.endpoint,
        happy: 0,
        edge: 0,
        blindSpot: 0,
        total: 0,
      });
    }
    const row = map.get(t.endpoint)!;
    row.total++;
    if (t.caseType === "happy") {
      row.happy++;
    } else if (t.caseType === "ai-blind-spot") {
      row.blindSpot++;
    } else {
      row.edge++;
    }
  }

  return Array.from(map.values());
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function renderTable(rows: EndpointRow[]): string {
  const COL_ENDPOINT = Math.max(8, ...rows.map((r) => r.endpoint.length));
  const COL_HAPPY = 5;
  const COL_EDGE = 4;
  const COL_BLIND = 13;
  const COL_TOTAL = 5;

  const header = [
    padRight("endpoint", COL_ENDPOINT),
    padLeft("happy", COL_HAPPY),
    padLeft("edge", COL_EDGE),
    padLeft("ai-blind-spot", COL_BLIND),
    padLeft("total", COL_TOTAL),
  ].join("  ");

  const divider = "-".repeat(header.length);

  const dataRows = rows.map((r) =>
    [
      padRight(r.endpoint, COL_ENDPOINT),
      padLeft(String(r.happy), COL_HAPPY),
      padLeft(String(r.edge), COL_EDGE),
      padLeft(String(r.blindSpot), COL_BLIND),
      padLeft(String(r.total), COL_TOTAL),
    ].join("  "),
  );

  const totalHappy = rows.reduce((s, r) => s + r.happy, 0);
  const totalEdge = rows.reduce((s, r) => s + r.edge, 0);
  const totalBlind = rows.reduce((s, r) => s + r.blindSpot, 0);
  const totalAll = rows.reduce((s, r) => s + r.total, 0);

  const totalsRow = [
    padRight("TOTAL", COL_ENDPOINT),
    padLeft(String(totalHappy), COL_HAPPY),
    padLeft(String(totalEdge), COL_EDGE),
    padLeft(String(totalBlind), COL_BLIND),
    padLeft(String(totalAll), COL_TOTAL),
  ].join("  ");

  return [header, divider, ...dataRows, divider, totalsRow].join("\n");
}

function renderBlindSpots(tests: SynthesizedTest[]): string {
  const blindSpots = tests.filter((t) => t.caseType === "ai-blind-spot");
  if (blindSpots.length === 0) return "";

  const lines = ["", "Blind spots detected:", ""];
  for (const t of blindSpots) {
    const desc = t.blindSpotPattern ?? t.testId;
    lines.push(`  • [${t.endpoint}] ${desc}`);
  }
  return lines.join("\n");
}

function isPipelineError(
  result: PipelineResult | PipelineError,
): result is PipelineError {
  return "stage" in result && "message" in result;
}

export function formatRunSummary(
  result: PipelineResult | PipelineError,
  opts: FormatOptions = {},
): string {
  if (opts.json) {
    return JSON.stringify(result, null, 2);
  }

  if (isPipelineError(result)) {
    return `[${result.stage}] Error: ${result.message} — run with --debug for details`;
  }

  const rows = buildEndpointRows(result.tests);
  const table = renderTable(rows);
  const blindSpotSection = renderBlindSpots(result.tests);

  return table + blindSpotSection;
}
