import { z } from "zod";
import { loadFixtures } from "../fixtures/harness";
import { SynthesizedTestSchema, type SynthesizedTest } from "../types/pipeline";

// --- Types ---

export const PerFixtureResultSchema = z.object({
  fixture: z.string(),
  caught: z.boolean(),
  structurallyValid: z.boolean(),
  expectedTestCount: z.number().int().nonnegative(),
  generatedTestCount: z.number().int().nonnegative(),
  missedTestIds: z.array(z.string()),
});
export type PerFixtureResult = z.infer<typeof PerFixtureResultSchema>;

export const QualityGateResultSchema = z.object({
  catchRate: z.number().min(0).max(1),
  falsePositiveRate: z.number().min(0).max(1),
  structuralValidity: z.number().min(0).max(1),
  passed: z.boolean(),
  perFixture: z.array(PerFixtureResultSchema),
  failReasons: z.array(z.string()),
});
export type QualityGateResult = z.infer<typeof QualityGateResultSchema>;

// Runner: given fixture name + expected testIds, returns SynthesizedTest[]
export type SynthesisRunner = (
  fixtureName: string,
  expectedTestIds: string[],
) => Promise<SynthesizedTest[]>;

// --- Thresholds ---

const CATCH_RATE_MIN = 0.8;
const FALSE_POSITIVE_RATE_MAX = 0.2;
const STRUCTURAL_VALIDITY_REQUIRED = 1.0;

// --- Helpers ---

function validateStructure(tests: SynthesizedTest[]): boolean {
  for (const t of tests) {
    const result = SynthesizedTestSchema.safeParse(t);
    if (!result.success) return false;
  }
  return true;
}

function checkCatch(
  generated: SynthesizedTest[],
  expectedTestIds: string[],
): { caught: boolean; missedTestIds: string[] } {
  const generatedIds = new Set(generated.map((t) => t.testId));
  const missed = expectedTestIds.filter((id) => !generatedIds.has(id));
  return { caught: missed.length === 0, missedTestIds: missed };
}

function hasFalsePositives(
  generated: SynthesizedTest[],
  expectedTestIds: string[],
): boolean {
  const expectedSet = new Set(expectedTestIds);
  return generated.some((t) => !expectedSet.has(t.testId));
}

// --- Gate ---

export async function runQualityGate(
  fixturesDir: string,
  synthesisRunner?: SynthesisRunner,
): Promise<QualityGateResult> {
  const runner = synthesisRunner ?? buildPassthroughRunner(fixturesDir);
  const fixtures = loadFixtures(fixturesDir);

  const perFixture: PerFixtureResult[] = [];
  const failReasons: string[] = [];

  let caughtCount = 0;
  let falsePositiveCount = 0;
  let structurallyValidCount = 0;

  for (const entry of fixtures) {
    if (!entry.output) {
      perFixture.push({
        fixture: entry.name,
        caught: false,
        structurallyValid: false,
        expectedTestCount: 0,
        generatedTestCount: 0,
        missedTestIds: [],
      });
      failReasons.push(
        `${entry.name}: fixture load error — ${entry.error ?? "unknown"}`,
      );
      continue;
    }

    const expectedTestIds = entry.output.expectedTests.map((t) => t.testId);

    let generated: SynthesizedTest[];
    try {
      generated = await runner(entry.name, expectedTestIds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      perFixture.push({
        fixture: entry.name,
        caught: false,
        structurallyValid: false,
        expectedTestCount: expectedTestIds.length,
        generatedTestCount: 0,
        missedTestIds: expectedTestIds,
      });
      failReasons.push(`${entry.name}: runner threw — ${msg}`);
      continue;
    }

    const structurallyValid = validateStructure(generated);
    if (structurallyValid) structurallyValidCount++;

    const { caught, missedTestIds } = checkCatch(generated, expectedTestIds);
    if (caught) caughtCount++;

    if (hasFalsePositives(generated, expectedTestIds)) falsePositiveCount++;

    if (!caught) {
      failReasons.push(
        `${entry.name}: missed testIds [${missedTestIds.join(", ")}]`,
      );
    }
    if (!structurallyValid) {
      failReasons.push(`${entry.name}: structural validation failed`);
    }

    perFixture.push({
      fixture: entry.name,
      caught,
      structurallyValid,
      expectedTestCount: expectedTestIds.length,
      generatedTestCount: generated.length,
      missedTestIds,
    });
  }

  const total = fixtures.length;
  const catchRate = total === 0 ? 0 : caughtCount / total;
  const falsePositiveRate = total === 0 ? 0 : falsePositiveCount / total;
  const structuralValidity = total === 0 ? 0 : structurallyValidCount / total;

  const passed =
    catchRate >= CATCH_RATE_MIN &&
    falsePositiveRate < FALSE_POSITIVE_RATE_MAX &&
    structuralValidity === STRUCTURAL_VALIDITY_REQUIRED;

  if (catchRate < CATCH_RATE_MIN) {
    failReasons.push(
      `catchRate ${catchRate.toFixed(2)} < required ${CATCH_RATE_MIN}`,
    );
  }
  if (falsePositiveRate >= FALSE_POSITIVE_RATE_MAX) {
    failReasons.push(
      `falsePositiveRate ${falsePositiveRate.toFixed(2)} >= max ${FALSE_POSITIVE_RATE_MAX}`,
    );
  }
  if (structuralValidity < STRUCTURAL_VALIDITY_REQUIRED) {
    failReasons.push(
      `structuralValidity ${structuralValidity.toFixed(2)} < required ${STRUCTURAL_VALIDITY_REQUIRED}`,
    );
  }

  return {
    catchRate,
    falsePositiveRate,
    structuralValidity,
    passed,
    perFixture,
    failReasons,
  };
}

// Default runner: maps fixture expectedTests to SynthesizedTest shape
function buildPassthroughRunner(fixturesDir: string): SynthesisRunner {
  return async (fixtureName: string) => {
    const fixtures = loadFixtures(fixturesDir);
    const entry = fixtures.find((f) => f.name === fixtureName);
    if (!entry?.output) return [];
    return entry.output.expectedTests.map((t) =>
      mapFixtureTestToSynthesized(t, fixtureName),
    );
  };
}

export function mapFixtureTestToSynthesized(
  t: {
    testId: string;
    caseType: string;
    description?: string;
    payload?: Record<string, unknown>;
    expectedStatus?: number;
    blindSpotPattern?: string;
    expectedResult?: "PASS" | "FAIL";
  },
  fixtureName: string,
): SynthesizedTest {
  return {
    testId: t.testId,
    endpoint: `/${fixtureName}`,
    caseType: t.caseType as SynthesizedTest["caseType"],
    payload: t.payload ?? {},
    expectedStatus: t.expectedStatus ?? 200,
    ...(t.blindSpotPattern ? { blindSpotPattern: t.blindSpotPattern } : {}),
    ...(t.expectedResult ? { expectedResult: t.expectedResult } : {}),
  };
}
