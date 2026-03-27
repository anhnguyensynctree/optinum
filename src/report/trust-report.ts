import { DiffBlastRadius } from "../types/pipeline";
import { GapReport } from "../analyzer/gap-analyzer";

export interface BlindSpotReportEntry {
  pattern: string;
  changeType: string;
  risk: "critical" | "high" | "medium" | "low";
  description: string;
  testedBy: string[];
}

export interface TrustReport {
  version: string;
  generatedAt: string;
  changedPathsCount: number;
  uncoveredPathsCount: number;
  blindSpotsDetected: BlindSpotReportEntry[];
  synthesizedTestsCount: number;
  hasPaidTier: boolean;
}

const BLIND_SPOT_RISK: Record<
  string,
  {
    risk: "critical" | "high" | "medium" | "low";
    description: string;
    changeType: string;
  }
> = {
  idempotency: {
    risk: "critical",
    description: "Duplicate payment or mutation risk",
    changeType: "new-write-endpoint",
  },
  auth: {
    risk: "critical",
    description: "Unauthorized access to protected resource",
    changeType: "new-auth-check",
  },
  ownership: {
    risk: "critical",
    description: "IDOR — user accesses another user's data",
    changeType: "new-write-endpoint",
  },
  cascade: {
    risk: "high",
    description: "Orphaned records or inconsistent state",
    changeType: "cascade-change",
  },
  transaction: {
    risk: "critical",
    description: "Partial failure leaves DB inconsistent",
    changeType: "new-write-endpoint",
  },
  cache: {
    risk: "medium",
    description: "Stale data served after write",
    changeType: "cascade-change",
  },
};

const RISK_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function buildTrustReport(options: {
  blastRadius: DiffBlastRadius;
  gapReports: GapReport[];
  synthesizedTestsCount?: number;
  hasPaidTier?: boolean;
  version?: string;
}): TrustReport {
  const {
    blastRadius,
    gapReports,
    synthesizedTestsCount = 0,
    hasPaidTier = false,
    version = "0.1.0",
  } = options;

  const changedPathsCount =
    blastRadius.changed.length + blastRadius.dependents.length;
  const uncoveredPathsCount = gapReports.filter(
    (r) => !r.testedDirectly,
  ).length;

  // Aggregate blind spots across all gap reports
  const allBlindSpots = new Map<string, string[]>();
  for (const report of gapReports) {
    for (const spot of report.blindSpotsWithoutCoverage) {
      if (!allBlindSpots.has(spot)) allBlindSpots.set(spot, []);
      allBlindSpots.get(spot)!.push(report.function.filePath);
    }
  }

  // Determine which blind spots have any test coverage (test file name contains keyword)
  const coveredSpots = new Set<string>();
  for (const report of gapReports) {
    if (report.testedDirectly) {
      for (const testFile of report.testFiles) {
        for (const spot of Object.keys(BLIND_SPOT_RISK)) {
          if (testFile.toLowerCase().includes(spot)) {
            coveredSpots.add(spot);
          }
        }
      }
    }
  }

  const blindSpotsDetected: BlindSpotReportEntry[] = [];
  for (const [spot, affectedFiles] of allBlindSpots) {
    const meta = BLIND_SPOT_RISK[spot];
    if (!meta) continue;
    blindSpotsDetected.push({
      pattern: spot,
      changeType: meta.changeType,
      risk: meta.risk,
      description: meta.description,
      testedBy: coveredSpots.has(spot) ? affectedFiles.slice(0, 2) : [],
    });
  }

  blindSpotsDetected.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);

  return {
    version,
    generatedAt: new Date().toISOString(),
    changedPathsCount,
    uncoveredPathsCount,
    blindSpotsDetected,
    synthesizedTestsCount,
    hasPaidTier,
  };
}
