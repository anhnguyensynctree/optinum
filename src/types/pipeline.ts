import { z } from "zod";

// Core node representing a function/class changed or affected in the diff
export const FunctionNodeSchema = z.object({
  filePath: z.string(),
  functionName: z.string(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
});
export type FunctionNode = z.infer<typeof FunctionNodeSchema>;

// Result of bidirectional AST traversal
export const DiffBlastRadiusSchema = z.object({
  changed: z.array(FunctionNodeSchema),
  dependents: z.array(FunctionNodeSchema), // upward: callers not in diff
  dependencies: z.array(FunctionNodeSchema), // downward: what changed code calls
  highFanOut: z.boolean().optional(),
});
export type DiffBlastRadius = z.infer<typeof DiffBlastRadiusSchema>;

// A single field in an API contract
export const EndpointContractFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
});
export type EndpointContractField = z.infer<typeof EndpointContractFieldSchema>;

// Normalized API contract from any schema source
export const EndpointContractSchema = z.object({
  endpoint: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  fields: z.array(EndpointContractFieldSchema),
  source: z.enum(["zod", "ts-interface", "openapi", "pydantic", "unknown"]),
  enrichment: z.array(EndpointContractFieldSchema).optional(),
});
export type EndpointContract = z.infer<typeof EndpointContractSchema>;

// Type of AI blind spot change pattern detected
export const ChangeTypeSchema = z.enum([
  "contract-change",
  "new-write-endpoint",
  "new-delete-operation",
  "new-auth-check",
  "schema-migration",
  "cascade-change",
  "unknown",
]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

// Case type for synthesized tests
export const CaseTypeSchema = z.enum([
  "happy",
  "edge",
  "boundary",
  "auth",
  "ai-blind-spot",
]);
export type CaseType = z.infer<typeof CaseTypeSchema>;

// A pattern discovered by Layer 3 from first-principles diff reasoning
export const DiscoveredPatternSchema = z.object({
  id: z.string(), // e.g. "dp-001"
  name: z.string(), // e.g. "async-state-invalidation"
  mechanism: z.string(), // what technically fails
  aiNativeReason: z.string(), // why AI is specifically blind to this
});
export type DiscoveredPattern = z.infer<typeof DiscoveredPatternSchema>;

// A single synthesized test
export const SynthesizedTestSchema = z.object({
  testId: z.string(),
  endpoint: z.string(),
  caseType: CaseTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  expectedStatus: z.number().int(),
  expectedShape: z.record(z.string(), z.unknown()).optional(),
  blindSpotPattern: z.string().optional(),
  expectedResult: z.enum(["PASS", "FAIL"]).optional(),
  discoveredPattern: DiscoveredPatternSchema.optional(),
});
export type SynthesizedTest = z.infer<typeof SynthesizedTestSchema>;

// Pipeline error with stage context
export const PipelineErrorSchema = z.object({
  stage: z.enum([
    "ast-parser",
    "schema-detector",
    "classifier",
    "synthesizer",
    "quality-gate",
  ]),
  message: z.string(),
  retries: z.number().int().optional(),
  lastOutput: z.unknown().optional(),
});
export type PipelineError = z.infer<typeof PipelineErrorSchema>;

// OSS benchmark record for a single commit
export const BenchmarkRecordSchema = z.object({
  repo: z.string(),
  commitSha: z.string(),
  commitMessage: z.string(),
  changedFiles: z.array(z.string()),
  changeTypes: z.array(ChangeTypeSchema),
  blindSpotsDetected: z.array(z.string()),
  laterFixCommit: z.string().nullable(),
  bugSignal: z.string().nullable(),
  timestamp: z.string(),
});
export type BenchmarkRecord = z.infer<typeof BenchmarkRecordSchema>;

// OSS evidence for a catalog expansion candidate
export const OssEvidenceSchema = z.object({
  repo: z.string(),
  commitSha: z.string(),
  changedFiles: z.array(z.string()),
  laterFixCommit: z.string().optional(),
  bugSignal: z.string().optional(),
});
export type OssEvidence = z.infer<typeof OssEvidenceSchema>;

// A candidate pattern for catalog expansion derived from benchmark results
export const ExpansionCandidateSchema = z.object({
  patternId: z.string(),
  changeType: ChangeTypeSchema,
  description: z.string(),
  evidence: z.array(OssEvidenceSchema),
  firesCount: z.number().int().nonnegative(),
  crossRefConfirmed: z.boolean(),
  approved: z.boolean().optional(),
});
export type ExpansionCandidate = z.infer<typeof ExpansionCandidateSchema>;

// Per-fixture quality gate result
export const PerFixtureResultSchema = z.object({
  fixture: z.string(),
  caught: z.boolean(),
  structurallyValid: z.boolean(),
  expectedTestCount: z.number().int().nonnegative(),
  generatedTestCount: z.number().int().nonnegative(),
  missedTestIds: z.array(z.string()),
});
export type PerFixtureResult = z.infer<typeof PerFixtureResultSchema>;

// Quality gate aggregate result
export const QualityGateResultSchema = z.object({
  catchRate: z.number().min(0).max(1),
  falsePositiveRate: z.number().min(0).max(1),
  structuralValidity: z.number().min(0).max(1),
  passed: z.boolean(),
  perFixture: z.array(PerFixtureResultSchema),
  failReasons: z.array(z.string()),
});
export type QualityGateResult = z.infer<typeof QualityGateResultSchema>;

// Full pipeline result
export const PipelineResultSchema = z.object({
  tests: z.array(SynthesizedTestSchema),
  errors: z.array(PipelineErrorSchema),
  catchRate: z.number().min(0).max(1).optional(),
  structuralValidity: z.boolean().optional(),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
