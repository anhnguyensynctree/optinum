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

// Full pipeline result
export const PipelineResultSchema = z.object({
  tests: z.array(SynthesizedTestSchema),
  errors: z.array(PipelineErrorSchema),
  catchRate: z.number().min(0).max(1).optional(),
  structuralValidity: z.boolean().optional(),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
