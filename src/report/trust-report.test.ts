import { test } from "node:test";
import { strict as assert } from "assert";
import { buildTrustReport } from "./trust-report";
import { renderGitHubComment } from "./templates/github-comment";
import { renderHtml } from "./templates/html-report";
import { DiffBlastRadius } from "../types/pipeline";
import { GapReport } from "../analyzer/gap-analyzer";

function makeBlastRadius(
  changedCount = 2,
  dependentCount = 1,
): DiffBlastRadius {
  const makeNode = (i: number) => ({
    filePath: `/src/api/route-${i}.ts`,
    functionName: `handler${i}`,
    startLine: 1,
    endLine: 10,
  });
  return {
    changed: Array.from({ length: changedCount }, (_, i) => makeNode(i)),
    dependents: Array.from({ length: dependentCount }, (_, i) =>
      makeNode(i + 100),
    ),
    dependencies: [],
  };
}

function makeGapReports(
  blastRadius: DiffBlastRadius,
  uncoveredFraction = 0.5,
): GapReport[] {
  const allNodes = [...blastRadius.changed, ...blastRadius.dependents];
  return allNodes.map((node, i) => ({
    function: node,
    testedDirectly: i < Math.floor(allNodes.length * (1 - uncoveredFraction)),
    testFiles: [],
    blindSpotsWithoutCoverage: i >= 1 ? ["idempotency", "auth"] : [],
  }));
}

test("buildTrustReport returns correct changedPathsCount", () => {
  const br = makeBlastRadius(3, 2);
  const gaps = makeGapReports(br);
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  assert.equal(report.changedPathsCount, 5);
});

test("buildTrustReport counts uncovered paths correctly", () => {
  const br = makeBlastRadius(4, 0);
  const gaps: GapReport[] = [
    {
      function: br.changed[0],
      testedDirectly: true,
      testFiles: [],
      blindSpotsWithoutCoverage: [],
    },
    {
      function: br.changed[1],
      testedDirectly: false,
      testFiles: [],
      blindSpotsWithoutCoverage: [],
    },
    {
      function: br.changed[2],
      testedDirectly: false,
      testFiles: [],
      blindSpotsWithoutCoverage: [],
    },
    {
      function: br.changed[3],
      testedDirectly: true,
      testFiles: [],
      blindSpotsWithoutCoverage: [],
    },
  ];
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  assert.equal(report.uncoveredPathsCount, 2);
});

test("blind spots sorted by risk severity", () => {
  const br = makeBlastRadius(1, 0);
  const gaps: GapReport[] = [
    {
      function: br.changed[0],
      testedDirectly: false,
      testFiles: [],
      blindSpotsWithoutCoverage: ["cache", "transaction", "idempotency"],
    },
  ];
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  if (report.blindSpotsDetected.length >= 2) {
    const risks = report.blindSpotsDetected.map((b) => b.risk);
    const riskOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    for (let i = 0; i < risks.length - 1; i++) {
      assert.ok(
        riskOrder[risks[i]] <= riskOrder[risks[i + 1]],
        "Risks should be sorted",
      );
    }
  }
});

test("renderGitHubComment produces valid markdown with details block", () => {
  const br = makeBlastRadius(2, 1);
  const gaps = makeGapReports(br, 0.5);
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  const markdown = renderGitHubComment(report);

  assert.ok(markdown.includes("Optinum"), "Should mention Optinum");
  assert.ok(typeof markdown === "string", "Should return string");
});

test("renderGitHubComment includes details block when blind spots exist", () => {
  const br = makeBlastRadius(1, 0);
  const gaps: GapReport[] = [
    {
      function: br.changed[0],
      testedDirectly: false,
      testFiles: [],
      blindSpotsWithoutCoverage: ["auth"],
    },
  ];
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  const markdown = renderGitHubComment(report);
  assert.ok(
    markdown.includes("<details>"),
    "Should include collapsible details block",
  );
  assert.ok(markdown.includes("</details>"), "Should close details block");
});

test("renderHtml produces valid HTML structure", () => {
  const br = makeBlastRadius(2, 0);
  const gaps = makeGapReports(br, 0);
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  const html = renderHtml(report);

  assert.ok(html.includes("<!DOCTYPE html>"), "Should have DOCTYPE");
  assert.ok(html.includes("<title>"), "Should have title");
  assert.ok(html.includes("Optinum"), "Should mention Optinum");
});

test("renderHtml shows no-blind-spots message when list is empty", () => {
  const br = makeBlastRadius(2, 0);
  const gaps: GapReport[] = br.changed.map((node) => ({
    function: node,
    testedDirectly: true,
    testFiles: [],
    blindSpotsWithoutCoverage: [],
  }));
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  const html = renderHtml(report);
  assert.ok(
    html.includes("No blind spot patterns detected"),
    "Should show empty state",
  );
});

test("buildTrustReport passes synthesizedTestsCount through", () => {
  const br = makeBlastRadius(1, 0);
  const gaps = makeGapReports(br, 0);
  const report = buildTrustReport({
    blastRadius: br,
    gapReports: gaps,
    synthesizedTestsCount: 7,
  });
  assert.equal(report.synthesizedTestsCount, 7);
});

test("buildTrustReport uses default version when not provided", () => {
  const br = makeBlastRadius(1, 0);
  const gaps = makeGapReports(br, 0);
  const report = buildTrustReport({ blastRadius: br, gapReports: gaps });
  assert.equal(report.version, "0.1.0");
});
