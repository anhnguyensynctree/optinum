import * as fs from "fs";
import { DiffBlastRadius } from "../../types/pipeline";

/**
 * Detects new DELETE handlers added to route files.
 */
export function detectNewDeleteOperation(
  blastRadius: DiffBlastRadius,
): boolean {
  for (const node of blastRadius.changed) {
    const content = tryReadFile(node.filePath);
    if (!content) continue;
    if (!isRouteFile(node.filePath)) continue;
    if (/export\s+(async\s+)?function\s+DELETE\s*\(/.test(content)) return true;
    if (/export\s+const\s+DELETE\s*=/.test(content)) return true;
  }
  return false;
}

function isRouteFile(filePath: string): boolean {
  return /route\.[jt]sx?$/.test(filePath);
}

function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
