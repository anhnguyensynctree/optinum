import { z } from "zod";

export const OptinumConfigSchema = z.object({
  ecosystem: z.enum(["typescript", "python"]),
  schemaFormat: z.enum(["zod", "pydantic", "openapi"]),
  testRunner: z.enum(["jest", "vitest", "pytest"]),
  outputDir: z.string(),
  llm: z.enum(["cli", "api"]).optional(),
});

export type OptinumConfig = z.infer<typeof OptinumConfigSchema>;
