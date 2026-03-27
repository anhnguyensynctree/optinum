# Company Belief — Optinum

## What We Are Building
An AI-native testing system that generates optimized, diff-scoped integration tests for software built by AI coding agents.

## Who It Is For
Developers and teams using AI coding agents (Claude Code, Copilot, Devin, Cursor) who need confidence that AI-generated code doesn't break integration boundaries — without the cost of running a full test suite on every PR.

## Our Operating Belief
Unit tests are low-value for AI-generated code — not because unit tests are bad, but because AI writes both the code and the tests from the same assumptions. When the code has a blind spot, the unit test has the same blind spot. Both pass. The bug ships.

This is structural, not incidental. LLMs learn from happy-path training data. They generate code that handles the cases they were shown. They generate tests that verify the code handles those same cases. The test suite turns green. The integration boundary breaks in production.

Optinum is the only observer outside that loop. It receives only the structural diff — blast radius, contracts, change type — and generates tests from an adversarially isolated context. It has no access to the developer's assumptions, the PR description, or the session that wrote the code. The independence is the mechanism of detection.

**Live proof of the thesis:** Claude Code changed a questionnaire route's URL params. Unit tests passed on both sides (questionnaire: ✓, home: ✓). The contract between them — the URL params the home page passes to questionnaire — was never tested. E2E caught it at runtime. Optinum would have caught it at diff time by traversing the upward call graph and generating contract tests for every caller of the changed route. This is the exact class of bug Optinum exists to catch: correct-in-isolation, broken-in-integration, invisible-to-unit-tests, and invisible-to-AI-written-unit-tests.

If we can make this as fast as a linter and as targeted as a code review, developers will adopt it as a default CI step — not a separate QA process.

## The Moat
Two synthesis layers that no existing tool combines:

**Layer 1 — Schema-grounded synthesis:** AST blast radius + Zod/Pydantic schema → structurally valid test payloads for the changed paths. This is better than existing tools but replicable.

**Layer 2 — AI blind spot synthesis:** LLMs have systematic, predictable failure patterns based on how they learned to write code. They write happy paths thoroughly and miss: auth assumption errors, idempotency gaps, input trust violations, null propagation, cascade effects, async race conditions. These aren't random — they're the shape of the training distribution. Optinum classifies the change type from AST, looks up known AI failure patterns for that type, and generates tests specifically targeting those blind spots.

Layer 2 is the defensible moat. Competitors can replicate schema-based generation. A blind spot catalog built from systematic analysis of how LLMs write code requires the product insight that human-written test suites lack: **the model optimizes for code that looks correct to a human reviewer, not code that survives all runtime conditions**.

Existing tools (Drill4J, Skippy, Tach) use AST for **test selection**. Optinum uses AST for **test generation + blind spot targeting**. No existing tool does this.

Momentic owns E2E UI testing. Keploy records live traffic. Optinum owns the API/backend integration layer for AI-generated code, with synthesis tuned to AI failure patterns specifically.

## Business Model
Deferred — prove the method first, decide how to sell it after.

Current stance: let people try 1-2 full synthesis runs (local trial counter, no infrastructure). Gap analysis + blind spot report is always free. Subscription model, pricing, and tiers are decided after FEATURE-006 validates the method works.

## Synthesizer Independence — Core Principle
The synthesizer is an independent observer, adversarially isolated from the developer session by design. It only receives the deterministic pipeline outputs: `blastRadius`, `contracts`, `changeTypes`, and blind spot catalog entries for those types. It never receives implementation code, PR description, commit message, or any session context from the developer's Claude Code session.

This independence is the mechanism of detection — if the synthesizer runs inside the same session that wrote the code, it shares the same assumptions and misses the same blind spots. Less context is a feature, not a bug. `claude --print` subprocess (fresh context) is the correct primary synthesis path for this reason.

## Strategic Constraints
- Developer experience is the north star — zero friction to adopt, integrates into existing CI
- Non-traditional methodology: we are not replacing unit tests or E2E suites, we are adding a new primitive
- API/backend first — no UI testing in V1; UI introduces visual regression complexity we are not solving yet
- Security edge case coverage is V2, not MVP
- The system must prove higher reliability than existing approaches, not just coverage
- Validation must be auditable: OSS repos as benchmark source, not internal fixtures only
- Technology quality over GTM: prove the method works before deciding how to sell it

## Out of Scope
- Unit test generation or replacement
- UI/browser/visual regression testing (V1)
- Full E2E suite replacement
- Non-AI-generated code diff scoping (nice to have, not the thesis)
- Language-specific IDEs or editor plugins (V1)
