import * as path from "path";
import { OptinumConfigSchema, type OptinumConfig } from "./config-schema";

export function loadConfig(projectRoot?: string): OptinumConfig | null {
  const root = projectRoot ?? process.cwd();
  const configPath = path.join(root, "optinum.config.ts");

  let raw: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    raw = require(configPath);
  } catch {
    return null;
  }

  // Handle both `export default` (ESM interop gives { default: ... }) and plain object
  const candidate =
    raw !== null &&
    typeof raw === "object" &&
    "default" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).default
      : raw;

  const result = OptinumConfigSchema.safeParse(candidate);
  if (!result.success) {
    return null;
  }
  return result.data;
}
