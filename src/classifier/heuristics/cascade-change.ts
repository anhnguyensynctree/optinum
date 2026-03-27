import * as fs from "fs";
import { DiffBlastRadius } from "../../types/pipeline";

/**
 * Detects cascade changes: delete/remove operations with dependents, cache invalidation, event emission.
 */
export function detectCascadeChange(blastRadius: DiffBlastRadius): boolean {
  for (const node of blastRadius.changed) {
    const content = tryReadFile(node.filePath);
    if (!content) continue;

    // Delete operations that could cascade
    if (/delete|remove|destroy/i.test(node.functionName)) {
      // Has dependent entities in blast radius
      if (blastRadius.dependents.length > 0) return true;
    }

    // Cache patterns
    if (/cache\.delete|cache\.clear|cache\.invalidate/.test(content))
      return true;

    // Event emission patterns
    if (/emit\s*\(|emitEvent\s*\(|eventBus\.emit/.test(content)) return true;
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
