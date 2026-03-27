import * as fs from "fs";
import { DiffBlastRadius } from "../../types/pipeline";

/**
 * Detects new auth checks: middleware patterns, session/token verification added to changed files.
 */
export function detectNewAuthCheck(blastRadius: DiffBlastRadius): boolean {
  for (const node of blastRadius.changed) {
    const content = tryReadFile(node.filePath);
    if (!content) continue;
    // Auth middleware patterns
    if (
      /requireAuth|authenticate|getSession|verifyToken|isAuthenticated/.test(
        content,
      )
    )
      return true;
    // Middleware files
    if (
      /middleware\.[jt]sx?$/.test(node.filePath) ||
      /auth\.[jt]sx?$/.test(node.filePath)
    )
      return true;
  }
  return false;
}

function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
