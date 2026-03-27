import { DiffBlastRadius, ChangeType } from "../types/pipeline";
import { detectContractChange } from "./heuristics/contract-change";
import { detectNewWriteEndpoint } from "./heuristics/new-write-endpoint";
import { detectNewDeleteOperation } from "./heuristics/new-delete-operation";
import { detectNewAuthCheck } from "./heuristics/new-auth-check";
import { detectSchemaMigration } from "./heuristics/schema-migration";
import { detectCascadeChange } from "./heuristics/cascade-change";

type Detector = (blastRadius: DiffBlastRadius) => boolean;

const HEURISTICS: Array<{ changeType: ChangeType; detect: Detector }> = [
  { changeType: "schema-migration", detect: detectSchemaMigration },
  { changeType: "contract-change", detect: detectContractChange },
  { changeType: "new-auth-check", detect: detectNewAuthCheck },
  { changeType: "new-write-endpoint", detect: detectNewWriteEndpoint },
  { changeType: "new-delete-operation", detect: detectNewDeleteOperation },
  { changeType: "cascade-change", detect: detectCascadeChange },
];

export function classifyChange(blastRadius: DiffBlastRadius): ChangeType[] {
  const detected: ChangeType[] = [];

  for (const { changeType, detect } of HEURISTICS) {
    try {
      if (detect(blastRadius)) {
        detected.push(changeType);
      }
    } catch (err) {
      console.warn(`[classifier] heuristic error for ${changeType}:`, err);
    }
  }

  if (detected.length === 0) {
    console.warn("[classifier] classification-miss — no heuristic matched");
    return ["unknown"];
  }

  return detected;
}
