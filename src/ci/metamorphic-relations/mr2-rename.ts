/**
 * MR-2: Renaming a variable in the changed function must not alter the
 * changeTypes output of the classifier.
 *
 * The classifier operates on structural blast-radius data (file paths, function
 * names, call graphs). A rename of a local variable is invisible at that level.
 * If changeTypes differ, a classifier heuristic has become name-sensitive.
 */

import type {
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../../types/pipeline";

export interface MRInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  classifyRunner: (blastRadius: DiffBlastRadius) => ChangeType[];
}

export interface MRResult {
  passed: boolean;
  violation?: string;
}

/**
 * Simulate the rename of a variable by adding "_renamed" to function names
 * in the changed array, mimicking the diff surface after a variable rename
 * touches the function body.
 */
function applyRenameMutation(blastRadius: DiffBlastRadius): DiffBlastRadius {
  return {
    ...blastRadius,
    changed: blastRadius.changed.map((node) => ({
      ...node,
      functionName: node.functionName + "_renamed",
    })),
  };
}

function setsEqual(a: ChangeType[], b: ChangeType[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) {
    if (!sb.has(v)) return false;
  }
  return true;
}

export async function runMR(input: MRInput): Promise<MRResult> {
  const { blastRadius, changeTypes, classifyRunner } = input;

  const baseTypes = classifyRunner(blastRadius);
  const mutatedBlastRadius = applyRenameMutation(blastRadius);
  const mutatedTypes = classifyRunner(mutatedBlastRadius);

  if (!setsEqual(baseTypes, mutatedTypes)) {
    return {
      passed: false,
      violation:
        `MR-2 violation: changeTypes differ after variable rename. ` +
        `Base: [${baseTypes.join(", ")}] Mutated: [${mutatedTypes.join(", ")}]. ` +
        `Expected changeTypes to be [${changeTypes.join(", ")}].`,
    };
  }

  return { passed: true };
}
