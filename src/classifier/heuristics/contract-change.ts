import * as fs from "fs";
import { DiffBlastRadius } from "../../types/pipeline";

/**
 * Detects contract changes: renamed fields, new required fields, removed fields, status code changes.
 * Signals: Zod schema changes in route files, OR HTTP response shape changes.
 */
export function detectContractChange(blastRadius: DiffBlastRadius): boolean {
  for (const node of blastRadius.changed) {
    const content = tryReadFile(node.filePath);
    if (!content) continue;

    // Zod schema in a route file
    if (isRouteFile(node.filePath) && content.includes("z.object("))
      return true;

    // Schema export that isn't a route (shared schema file)
    if (node.functionName.includes("Schema") && content.includes("z.object("))
      return true;

    // Return shape change: function returns different shape than before
    // Heuristic: function returns an object literal and file is an API route
    if (isRouteFile(node.filePath) && /return\s+Response\.json\(/.test(content))
      return true;
  }
  return false;
}

function isRouteFile(filePath: string): boolean {
  return /route\.[jt]sx?$/.test(filePath) || /routes?\.[jt]sx?$/.test(filePath);
}

function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
