import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
  BenchmarkRecord,
  ExpansionCandidate,
  OssEvidence,
} from "../types/pipeline";
import { CatalogPattern, BlindSpotCatalog } from "./catalog";

// Zod schema for catalog file validation (mirrors CatalogPattern)
const CatalogPatternFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  changeType: z.string(),
  description: z.string(),
  testPattern: z.object({
    assertType: z.enum([
      "field-sent",
      "field-not-sent",
      "status-code",
      "artifact-exists",
      "artifact-missing",
      "call-made",
      "call-not-made",
    ]),
    description: z.string(),
    field: z.string().optional(),
    value: z.unknown().optional(),
  }),
  ossEvidence: z.string().nullable(),
  provisional: z.boolean(),
  fixtureRef: z.string().nullable(),
  severity: z.enum(["critical", "high", "medium", "low"]),
});

const BlindSpotCatalogFileSchema = z.object({
  version: z.string(),
  patterns: z.array(CatalogPatternFileSchema),
});

export interface GenerateExpansionCandidatesOptions {
  benchmarkResults: BenchmarkRecord[];
  existingCatalog: CatalogPattern[];
}

function buildPatternKey(changeType: string, description: string): string {
  return `${changeType}::${description.toLowerCase().trim()}`;
}

export function generateExpansionCandidates(
  options: GenerateExpansionCandidatesOptions,
): ExpansionCandidate[] {
  const { benchmarkResults, existingCatalog } = options;

  // Index existing patterns by changeType for fast lookup
  const existingByChangeType = new Map<string, CatalogPattern[]>();
  for (const p of existingCatalog) {
    const group = existingByChangeType.get(p.changeType) ?? [];
    group.push(p);
    existingByChangeType.set(p.changeType, group);
  }

  // Existing pattern keys (changeType::description) to detect dupes
  const existingKeys = new Set(
    existingCatalog.map((p) => buildPatternKey(p.changeType, p.description)),
  );

  // Accumulate evidence keyed by patternId (existing) or synthetic key (new)
  const candidateMap = new Map<
    string,
    {
      patternId: string;
      changeType: string;
      description: string;
      evidence: OssEvidence[];
    }
  >();

  for (const record of benchmarkResults) {
    for (const changeType of record.changeTypes) {
      const existingPatterns = existingByChangeType.get(changeType) ?? [];

      if (existingPatterns.length > 0) {
        // Fire against each matched existing pattern
        for (const pattern of existingPatterns) {
          const key = pattern.id;
          const entry = candidateMap.get(key) ?? {
            patternId: pattern.id,
            changeType,
            description: pattern.description,
            evidence: [],
          };
          const ev: OssEvidence = {
            repo: record.repo,
            commitSha: record.commitSha,
            changedFiles: record.changedFiles,
            ...(record.laterFixCommit != null
              ? { laterFixCommit: record.laterFixCommit }
              : {}),
            ...(record.bugSignal != null
              ? { bugSignal: record.bugSignal }
              : {}),
          };
          entry.evidence.push(ev);
          candidateMap.set(key, entry);
        }
      } else {
        // New pattern — no existing catalog entry for this changeType
        const description = `Detected change type without catalog coverage: ${changeType}`;
        const syntheticKey = buildPatternKey(changeType, description);
        if (!existingKeys.has(syntheticKey)) {
          const patternId = `new-${changeType}`;
          const entry = candidateMap.get(patternId) ?? {
            patternId,
            changeType,
            description,
            evidence: [],
          };
          const ev: OssEvidence = {
            repo: record.repo,
            commitSha: record.commitSha,
            changedFiles: record.changedFiles,
            ...(record.laterFixCommit != null
              ? { laterFixCommit: record.laterFixCommit }
              : {}),
            ...(record.bugSignal != null
              ? { bugSignal: record.bugSignal }
              : {}),
          };
          entry.evidence.push(ev);
          candidateMap.set(patternId, entry);
        }
      }
    }
  }

  // Build final candidates
  const candidates: ExpansionCandidate[] = [];
  for (const entry of candidateMap.values()) {
    const isExisting = existingCatalog.some((p) => p.id === entry.patternId);
    // crossRefConfirmed = matched an existing catalog pattern AND has evidence
    const crossRefConfirmed = isExisting && entry.evidence.length > 0;
    candidates.push({
      patternId: entry.patternId,
      changeType: entry.changeType as ExpansionCandidate["changeType"],
      description: entry.description,
      evidence: entry.evidence,
      firesCount: entry.evidence.length,
      crossRefConfirmed,
    });
  }

  return candidates;
}

export function writeCandidates(
  candidates: ExpansionCandidate[],
  outputPath: string,
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(candidates, null, 2));
}

export function applyApprovedCandidates(
  candidatesPath: string,
  catalogPath: string,
): void {
  const rawCandidates = JSON.parse(
    fs.readFileSync(candidatesPath, "utf-8"),
  ) as unknown[];
  const approved = rawCandidates.filter(
    (c): c is ExpansionCandidate & { approved: true } =>
      typeof c === "object" &&
      c !== null &&
      (c as Record<string, unknown>)["approved"] === true,
  );

  if (approved.length === 0) return;

  const rawCatalog = JSON.parse(
    fs.readFileSync(catalogPath, "utf-8"),
  ) as unknown;
  const catalog = BlindSpotCatalogFileSchema.parse(rawCatalog);

  const existingIds = new Set(catalog.patterns.map((p) => p.id));

  for (const candidate of approved) {
    if (existingIds.has(candidate.patternId)) {
      // Update ossEvidence on the existing pattern
      const pattern = catalog.patterns.find(
        (p) => p.id === candidate.patternId,
      );
      if (pattern) {
        pattern.ossEvidence = candidate.evidence
          .map((e) => `${e.repo}@${e.commitSha}`)
          .join(", ");
        pattern.provisional = false;
      }
    } else {
      // Add new pattern to catalog
      const newPattern = {
        id: candidate.patternId,
        name: candidate.description.slice(0, 60),
        changeType: candidate.changeType,
        description: candidate.description,
        testPattern: {
          assertType: "call-made" as const,
          description: `Verify pattern: ${candidate.description}`,
        },
        ossEvidence: candidate.evidence
          .map((e) => `${e.repo}@${e.commitSha}`)
          .join(", "),
        provisional: false,
        fixtureRef: null,
        severity: "medium" as const,
      };
      catalog.patterns.push(newPattern);
      existingIds.add(candidate.patternId);
    }
  }

  // Validate catalog before writing
  BlindSpotCatalogFileSchema.parse(catalog);

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
}
