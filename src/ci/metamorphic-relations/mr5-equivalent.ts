/**
 * MR-5: Identical diffs applied to two fixtures with the same schema must
 * produce structurally equivalent output test structures.
 *
 * If two fixtures share the same endpoint schema and the same blast radius
 * shape (same function signatures, same changeTypes), the synthesizer must
 * emit tests with equivalent caseType distributions. Different endpoint names
 * are allowed; the structure (caseTypes, field names) must match.
 */

import type {
  SynthesizedTest,
  DiffBlastRadius,
  EndpointContract,
  ChangeType,
} from "../../types/pipeline";

export interface MRFixture {
  blastRadius: DiffBlastRadius;
  contracts: EndpointContract[];
  changeTypes: ChangeType[];
}

export interface MRInput {
  fixtureA: MRFixture;
  fixtureB: MRFixture;
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

interface CaseTypeDistribution {
  [caseType: string]: number;
}

function getCaseTypeDistribution(
  tests: SynthesizedTest[],
): CaseTypeDistribution {
  const dist: CaseTypeDistribution = {};
  for (const t of tests) {
    dist[t.caseType] = (dist[t.caseType] ?? 0) + 1;
  }
  return dist;
}

function distributionsEquivalent(
  a: CaseTypeDistribution,
  b: CaseTypeDistribution,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.join(",") !== keysB.join(",")) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function getFieldNames(contracts: EndpointContract[]): string[] {
  return contracts.flatMap((c) => c.fields.map((f) => f.name)).sort();
}

export async function runMR(input: MRInput): Promise<MRResult> {
  const { fixtureA, fixtureB, runner } = input;

  // Verify fixtures share the same schema shape before comparing output
  const fieldsA = getFieldNames(fixtureA.contracts);
  const fieldsB = getFieldNames(fixtureB.contracts);
  if (fieldsA.join(",") !== fieldsB.join(",")) {
    return {
      passed: false,
      violation:
        `MR-5 precondition failed: fixtures do not share the same schema. ` +
        `FixtureA fields: [${fieldsA.join(", ")}] FixtureB fields: [${fieldsB.join(", ")}]`,
    };
  }

  const testsA = await runner(
    fixtureA.blastRadius,
    fixtureA.contracts,
    fixtureA.changeTypes,
  );
  const testsB = await runner(
    fixtureB.blastRadius,
    fixtureB.contracts,
    fixtureB.changeTypes,
  );

  const distA = getCaseTypeDistribution(testsA);
  const distB = getCaseTypeDistribution(testsB);

  if (!distributionsEquivalent(distA, distB)) {
    const fmtDist = (d: CaseTypeDistribution) =>
      Object.entries(d)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
    return {
      passed: false,
      violation:
        `MR-5 violation: output test structures differ across equivalent fixtures. ` +
        `FixtureA: {${fmtDist(distA)}} FixtureB: {${fmtDist(distB)}}`,
    };
  }

  return { passed: true };
}
