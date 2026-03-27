# QA Engineer Context — Optinum

## Dual Authority

This project gives QA two distinct roles. Both are active in every OMS discussion:

**Role 1 — Standard QA:** test coverage, reliability, flakiness, regression on Optinum's own codebase.

**Role 2 — Domain Expert:** Optinum is a testing tool. QA has practitioner-level insight into what makes tests valuable, what edge cases matter, and where existing tools fail. This expertise feeds directly into product decisions — QA participates in synthesis discussions, not just implementation review.

## Product Domain Knowledge

**Why unit tests are low-signal for AI-generated code:**
- LLMs produce syntactically valid code by default — unit tests catch syntax, not logic
- AI agents hallucinate at integration boundaries (auth checks, DB constraints, cross-service contracts)
- Unit tests mock away exactly the boundaries where AI makes mistakes

**What Optinum's synthesized tests must cover to be credible:**
- Happy path (baseline — table stakes)
- Boundary conditions (empty arrays, null fields, max/min values, pagination edge)
- Auth/permission edge cases (unauthenticated, wrong role, expired token)
- State-dependent paths (what the test assumes about DB state must be explicit)
- Idempotency for write operations (POST/PUT/DELETE called twice — what happens?)
- Cascade effects (delete/update with downstream state dependencies)

**AI Blind Spot Catalog — QA co-owns this:**
QA practitioner knowledge of what AI agents *actually miss* in code review drives catalog entries. High-confidence patterns by change type:
- `new-write-endpoint`: idempotency gap, auth ownership skip, unvalidated input trust, cascade blindness
- `new-validation-branch`: missing else/default, type coercion (null vs "" vs 0 vs false), async error swallow
- `new-auth-check`: ownership check absent, role escalation path, token expiry not handled
- `new-db-write`: no transaction wrapper, FK assumption, concurrent write race condition
- `new-delete-operation`: soft-delete assumption, cascade not handled, no idempotency check
- `contract-change`: changed function signature, return shape, URL params, or route structure — all callers in the upward blast radius must be verified. AI fixes the function it was looking at; callers it didn't open retain the old contract assumption and silently break. **Live example confirmed:** Claude changed a questionnaire route's URL params, unit tests passed on both sides, but the home→questionnaire navigation contract was broken until E2E caught it. Optinum catches this at diff time by traversing upward and generating contract tests for every caller.

QA defines what "caught" means for each blind spot in the fixture set. A test that runs but asserts the wrong thing is not a catch.

**Flakiness signals — flag these in any synthesized test:**
- Tests that depend on ordering of previous tests
- Tests that assert on timestamps or generated IDs without normalization
- Tests that hit external services without mocking
- Tests that pass on first run, fail on second (state leak)

## QA Standards for Optinum's Own Code
- Every module in the synthesis pipeline needs unit tests
- Integration tests must use a real (test) database — no mocks of the DB layer
- Self-correction loop must be tested: inject a bad LLM response, verify retry fires
- CLI commands need E2E tests against a fixture PR diff + Zod/Pydantic schema

## Self-Validation Metrics (QA owns these)
Research-backed quality dimensions for Optinum's own pipeline (from arXiv:2307.00588, :2601.09695, :2410.10628):

**Tier 1 — Execution fidelity:**
- Compilability: % of synthesized tests that compile without errors
- Executability: % that run without crashing
- Assertion correctness: % where assertions reflect true expected behavior (verified via mutation oracle)

**Tier 2 — Coverage:** line, branch, method coverage on Optinum's own code

**Tier 3 — Bug detection:**
- Mutation score (StrykerJS): % of introduced faults caught — primary quality driver
- Fixture catch rate: % of known bugs in OSS benchmark caught
- Defects4J-style kill rate once benchmark is mature

**Tier 4 — Test health (invisible failure mode):**
- Assertion Roulette rate: multiple assertions without labels — TsDetect detects this
- Magic Number Test rate: unexplained literals in assertions
- These pass coverage + mutation metrics but are unmaintainable — QA must gate on them

**Tier 5 — Generator efficiency:**
- LLM call cost per test generated
- Redundancy rate: % of tests covering same path as another test

## Success Metric for V1
A QA practitioner should be able to look at Optinum's output and say:
"This would have caught the bug" — for at least 80% of real integration failures in a test dataset.
Coverage number is secondary. Catch rate on real failure patterns is primary.
