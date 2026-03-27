# Trust Report

The trust report answers one question: given what changed in this diff, how much of the known AI blind spot surface did Optinum probe?

## What Trust Measures

Trust is a ratio: blind spot tests generated divided by the maximum blind spot tests possible for the detected change types.

A change classified as `new-write-endpoint` has five catalog patterns: `idempotency-missing`, `auth-ownership-gap`, `auth-check-missing`, `input-trust-violation`, `transaction-missing`. If the synthesizer generates tests for all five, trust is 1.0 (100%). If schema information is insufficient and only two patterns produce tests, trust is 0.4.

Trust does not measure whether the generated tests pass or fail — it measures coverage of the known AI failure surface for the change type.

## What Drives Trust Up

- **Accurate schema detection** — Zod and Pydantic schemas give the synthesizer structured contract information. OpenAPI fallback produces fewer targeted tests.
- **Well-scoped diffs** — small, focused diffs produce more precise blast radius analysis. Large diffs with many unrelated changes reduce classification confidence.
- **Matching change types** — the catalog covers `contract-change`, `new-write-endpoint`, `cascade-change`, `schema-migration`, and `type-widening`. Changes that don't fall into a catalog type produce only happy + edge tests.

## What Drives Trust Down

- Schema format set to `openapi` when Zod or Pydantic is actually in use — run `optinum init` again to fix.
- Changed files have no detectable export contracts (utility functions with no schema boundary).
- Diff contains only test file changes — no source files to analyze.

## Interpreting Trust in CI

A trust score below 0.5 on a `new-write-endpoint` or `contract-change` diff is a signal to review manually. The synthesizer could not generate tests for more than half the known failure patterns for that change type.

Trust above 0.8 means the generated test file covers the major AI blind spot surface for this diff. Passing tests at that trust level is meaningful signal that the AI-generated change does not exhibit the known failure patterns for its type.

## Relationship to Gap Report

The gap report shows raw test counts. The trust report normalizes those counts against what was possible. Both are needed: a gap report with 10 blind spot tests and 90% trust is a very different signal from 10 blind spot tests and 20% trust.
