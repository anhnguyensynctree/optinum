/**
 * MR-1: No-op refactor (rename local var) added to diff does not change
 * the set of blind spot patterns detected.
 *
 * A purely cosmetic change — renaming a local variable — must not alter
 * which catalog patterns fire. If the pipeline reports more or fewer blind
 * spots when the only delta is a variable rename, a prompt or catalog change
 * has introduced sensitivity to irrelevant tokens.
 */

import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../../types/pipeline";

export interface MRInput {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
  runner: (
    blastRadius: DiffBlastRadius,
    contracts: EndpointContract[],
    changeTypes: ChangeType[],
  ) => Promise<SynthesizedTest[]>;
}

export interface MRResult {
  passed: boolean;
  violation?: string;
}

/**
 * Produce a mutated blast radius that adds a cosmetic no-op: a renamed local
 * variable represented as an extra function node with a "_noop" suffix name.
 */
function applyNoopMutation(blastRadius: DiffBlastRadius): DiffBlastRadius {
  const noopNode = {
    filePath: "src/util/noop.ts",
    functionName: "helperRenamed_noop",
    startLine: 1,
    endLine: 5,
  };
  return {
    ...blastRadius,
    // Append the noop node to changed — classifiers must not fire on it
    changed: [...blastRadius.changed, noopNode],
  };
}

function extractBlindSpotPatterns(tests: SynthesizedTest[]): Set<string> {
  return new Set(
    tests
      .filter((t) => t.blindSpotPattern !== undefined)
      .map((t) => t.blindSpotPattern as string),
  );
}

export async function runMR(input: MRInput): Promise<MRResult> {
  const { blastRadius, contracts, changeTypes, runner } = input;

  const baseTests = await runner(blastRadius, contracts, changeTypes);
  const mutatedBlastRadius = applyNoopMutation(blastRadius);
  const mutatedTests = await runner(mutatedBlastRadius, contracts, changeTypes);

  const basePatterns = extractBlindSpotPatterns(baseTests);
  const mutatedPatterns = extractBlindSpotPatterns(mutatedTests);

  const added = [...mutatedPatterns].filter((p) => !basePatterns.has(p));
  const removed = [...basePatterns].filter((p) => !mutatedPatterns.has(p));

  if (added.length > 0 || removed.length > 0) {
    return {
      passed: false,
      violation:
        `MR-1 violation: blind spot patterns changed after no-op refactor. ` +
        `Added: [${added.join(", ")}] Removed: [${removed.join(", ")}]`,
    };
  }

  return { passed: true };
}
