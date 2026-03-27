# CTO Context — Optinum

## Product
Optinum: diff-scoped integration test synthesis engine for AI-generated code.
Core pipeline: AST diff → blast radius map (bidirectional: downward deps + upward dependents) → SchemaDetector → LLM synthesis → runnable tests.

## Architecture

### Flow Detection Engine (core)
Three-stage pipeline:
1. **Blast Radius Detection** — parse the PR diff as AST, bidirectional traversal:
   - Downward: what does the changed function call? (dependency chain, 1-2 levels)
   - Upward: what calls the changed function across the entire codebase? (dependent chain, 1-2 levels)
   - Upward is the critical direction — AI fixes the code it was looking at, forgets every caller with now-broken assumptions
2. **Context Gathering** — fetch OpenAPI 3.x spec (or GraphQL schema) for the affected endpoints; pull TypeScript interfaces or Pydantic models associated with those paths
3. **LLM Synthesis** — feed AST diff + schema contracts to LLM; structured prompt generates test payloads covering happy path, boundary conditions, and edge cases for the modified execution branch only

### Interface
- CLI: `optinum test --diff <pr-url|diff-file>` — primary developer-facing surface
- GitHub Action: runs on PR open/update, comments results on PR
- No web dashboard in V1

### Target Ecosystem (V1)
TypeScript/Node.js + Python/FastAPI — both in V1 via SchemaDetector abstraction.

**SchemaDetector priority (replaces "SpecLoader"):**
- TypeScript project: Zod schemas → TypeScript interfaces → OpenAPI (enrichment only)
- Python project: Pydantic models → OpenAPI (FastAPI generates it from Pydantic anyway)
- Cross-language: OpenAPI as primary
Auto-detect from package.json / pyproject.toml. Normalize all sources to `EndpointContract[]`.

Rationale: AI-first projects use Zod (TS) or Pydantic (Python) — not OpenAPI. Requiring OpenAPI would exclude the majority of the target market. Zod/Pydantic are strictly better schema sources for their ecosystems.

## Competitive Positioning
- **vs Drill4J / Skippy / Tach:** Those use AST for test *selection* (which existing tests to run). Optinum uses AST for test *generation* (synthesizing new tests). Fundamentally different output.
- **vs Keploy:** Keploy records live traffic to generate tests. Optinum generates proactively from the diff — no live traffic needed.
- **vs Momentic:** Momentic owns E2E UI/browser testing. Optinum owns API/backend integration layer. Not competing directly.
- **vs EvoMaster/fuzzers:** Fuzzers throw random data, don't validate business logic. Optinum is schema-aware and diff-scoped.

## Self-Validation Architecture (Three-Loop System)
Optinum validates its own AI-written code. Research findings (see sessions/research-self-validation.md):

**The circularity problem is real.** Same model that writes code has correlated blind spots when generating tests. Copilot study: 29.5% of snippets contain weaknesses the model cannot fix when prompted. Solution: heterogeneous oracle stack, not a single LLM judge.

**Compiled-artifact pattern** (from Jest/Vitest/Pytest): self-validation always runs against a versioned Optinum release via external process, never against the source branch being developed.

**Three-loop architecture:**
- Inner: AI writes code → Optinum pipeline runs on that PR → measures compilability, coverage, fixture catch rate
- Middle (adversarial): StrykerJS generates surviving mutants → TestSynthesizer iterates to kill them → mutation score delta drives improvement (based on AdverTest, arXiv:2602.08146 — 63% improvement over EvoSuite)
- Outer (metamorphic): verify Optinum's outputs satisfy MRs (adding a no-op refactor must not change which blind spots fire)

**Oracle stack — StrykerJS is a floor, not a ceiling:**
- StrykerJS mutation testing: sanity check only — "do Optinum's tests catch trivial syntactic mutations?" If not, something is badly broken. But StrykerJS cannot detect business logic failures, integration path breaks, or AI-specific blind spots. It has no understanding of what code is *supposed* to do.
- Primary signal: catch rate on the OSS benchmark — real bugs in real codebases, not synthetic mutations
- Metamorphic relations on Optinum outputs — output consistency checks, no LLM judgment needed
- **Cross-model validation dropped** — irrelevant. Validation is about enumerating all code paths a change could affect, not LLM opinion. Deterministic analysis > model comparison.

**Test smell detection:** LLMs systematically produce Assertion Roulette + Magic Number Test. Add TsDetect pass to quality scoring. These pass coverage + mutation metrics but are unmaintainable.

## Key Technical Risks
- LLM-synthesized tests may fail due to prompt hallucination (bad payload structure) → need self-correction loop
- AST parsing across multiple languages is non-trivial → start with one ecosystem
- OpenAPI spec may be missing or stale for many projects → fallback strategy needed (infer from code if no spec)
- Circularity: same model writing code and tests shares blind spots → three-loop oracle stack required

## V2 Scope
- Security edge case synthesis (auth bypass, IDOR, injection patterns)
- GraphQL schema support
- Multi-language AST support
