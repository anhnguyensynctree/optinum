import * as fs from "fs";
import { DiffBlastRadius } from "../../types/pipeline";

/**
 * Detects new write endpoints: POST/PUT/PATCH handlers added to route files.
 */
export function detectNewWriteEndpoint(blastRadius: DiffBlastRadius): boolean {
  for (const node of blastRadius.changed) {
    const content = tryReadFile(node.filePath);
    if (!content) continue;

    if (!isRouteFile(node.filePath)) continue;

    // New exported HTTP mutation handler
    if (/export\s+(async\s+)?function\s+(POST|PUT|PATCH)\s*\(/.test(content))
      return true;

    // New route handler via object export
    if (/export\s+const\s+(POST|PUT|PATCH)\s*=/.test(content)) return true;
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
