/**
 * MR-3: Duplicating an unchanged function must not expand blastRadius.dependents.
 *
 * If a function that was NOT changed is duplicated (copy-pasted under a new name),
 * the blast radius of the changed functions must remain identical. No new dependents
 * should appear simply because unchanged code was replicated.
 */

import type {
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
  FunctionNode,
} from "../../types/pipeline";

export interface MRInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  runner: (
    blastRadius: DiffBlastRadius,
    contracts: EndpointContract[],
    changeTypes: ChangeType[],
  ) => Promise<DiffBlastRadius>;
}

export interface MRResult {
  passed: boolean;
  violation?: string;
}

function makeKey(node: FunctionNode): string {
  return `${node.filePath}::${node.functionName}`;
}

/**
 * Simulate duplicating an unchanged function by adding a copy with "_dup" suffix
 * into the dependents array. The blast radius expansion logic must not pick this
 * up as a new dependent of the changed code.
 */
function applyDuplicateMutation(blastRadius: DiffBlastRadius): DiffBlastRadius {
  if (blastRadius.dependents.length === 0) {
    // Nothing to duplicate — add a synthetic unchanged dependent duplicate
    const dupNode: FunctionNode = {
      filePath: "src/util/unchanged.ts",
      functionName: "helperFn_dup",
      startLine: 1,
      endLine: 10,
    };
    return {
      ...blastRadius,
      dependents: [...blastRadius.dependents, dupNode],
    };
  }

  const original = blastRadius.dependents[0];
  const dupNode: FunctionNode = {
    ...original,
    functionName: original.functionName + "_dup",
  };
  return {
    ...blastRadius,
    dependents: [...blastRadius.dependents, dupNode],
  };
}

export async function runMR(input: MRInput): Promise<MRResult> {
  const { blastRadius, contracts, changeTypes, runner } = input;

  const baseResult = await runner(blastRadius, contracts, changeTypes);
  const mutatedBlastRadius = applyDuplicateMutation(blastRadius);
  const mutatedResult = await runner(
    mutatedBlastRadius,
    contracts,
    changeTypes,
  );

  const baseDependentKeys = new Set(baseResult.dependents.map(makeKey));
  const mutatedDependentKeys = new Set(mutatedResult.dependents.map(makeKey));

  // Check for expansion: any keys in mutated that weren't in base (excluding the dup node)
  const dupSuffix = "_dup";
  const unexpectedExpansion = [...mutatedDependentKeys].filter(
    (k) => !baseDependentKeys.has(k) && !k.endsWith(dupSuffix),
  );

  if (unexpectedExpansion.length > 0) {
    return {
      passed: false,
      violation:
        `MR-3 violation: blastRadius.dependents expanded after duplicating an unchanged function. ` +
        `Unexpected new dependents: [${unexpectedExpansion.join(", ")}]`,
    };
  }

  return { passed: true };
}
