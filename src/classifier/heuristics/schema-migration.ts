import * as fs from "fs";
import { DiffBlastRadius } from "../../types/pipeline";

/**
 * Detects schema migrations: Prisma schema changes, ORM model modifications, Drizzle table definitions.
 */
export function detectSchemaMigration(blastRadius: DiffBlastRadius): boolean {
  for (const node of blastRadius.changed) {
    // Prisma schema — filename check only, no read needed
    if (node.filePath.endsWith("schema.prisma")) return true;

    const content = tryReadFile(node.filePath);
    if (!content) continue;
    // SQLAlchemy model
    if (
      /class\s+\w+\s*\(\s*Base\s*\)/.test(content) ||
      /db\.Column/.test(content)
    )
      return true;
    // Drizzle schema
    if (
      /pgTable|mysqlTable|sqliteTable/.test(content) &&
      node.filePath.includes("schema")
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
