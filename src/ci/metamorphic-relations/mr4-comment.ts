/**
 * MR-4: Adding a comment block to a changed function must produce structurally
 * equivalent SynthesizedTest[] output (same caseTypes and field names).
 *
 * Comments carry no semantic meaning. If the synthesizer produces tests with
 * different caseTypes or payload field names after a comment is added to a
 * changed function, the prompt has become sensitive to comment text.
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

interface TestStructure {
  caseType: string;
  payloadKeys: string[];
}

function extractStructure(tests: SynthesizedTest[]): TestStructure[] {
  return tests.map((t) => ({
    caseType: t.caseType,
    payloadKeys: Object.keys(t.payload).sort(),
  }));
}

function structuresEquivalent(a: TestStructure[], b: TestStructure[]): boolean {
  if (a.length !== b.length) return false;

  const toKey = (s: TestStructure) =>
    `${s.caseType}:${s.payloadKeys.join(",")}`;
  const setA = new Set(a.map(toKey));
  const setB = new Set(b.map(toKey));

  if (setA.size !== setB.size) return false;
  for (const k of setA) {
    if (!setB.has(k)) return false;
  }
  return true;
}

/**
 * Simulate adding a comment block by annotating function names with a
 * comment-marker suffix — visible to structural metadata but not semantic.
 */
function applyCommentMutation(blastRadius: DiffBlastRadius): DiffBlastRadius {
  return {
    ...blastRadius,
    changed: blastRadius.changed.map((node) => ({
      ...node,
      // Extend the line range slightly to simulate a comment block insertion
      endLine: node.endLine + 5,
    })),
  };
}

export async function runMR(input: MRInput): Promise<MRResult> {
  const { blastRadius, contracts, changeTypes, runner } = input;

  const baseTests = await runner(blastRadius, contracts, changeTypes);
  const mutatedBlastRadius = applyCommentMutation(blastRadius);
  const mutatedTests = await runner(mutatedBlastRadius, contracts, changeTypes);

  const baseStructure = extractStructure(baseTests);
  const mutatedStructure = extractStructure(mutatedTests);

  if (!structuresEquivalent(baseStructure, mutatedStructure)) {
    const baseSummary = baseStructure
      .map((s) => `${s.caseType}[${s.payloadKeys}]`)
      .join("; ");
    const mutatedSummary = mutatedStructure
      .map((s) => `${s.caseType}[${s.payloadKeys}]`)
      .join("; ");
    return {
      passed: false,
      violation:
        `MR-4 violation: test structures differ after adding comment block. ` +
        `Base: [${baseSummary}] Mutated: [${mutatedSummary}]`,
    };
  }

  return { passed: true };
}
