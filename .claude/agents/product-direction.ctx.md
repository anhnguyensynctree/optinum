# Product Direction — Optinum

## Current Phase
Pre-MVP. Architecture design and core engine definition.

## Current Priorities
1. Define the Flow Detection Engine: AST diff parsing → blast radius mapping → OpenSpec enrichment pipeline
2. Design the CLI interface (`optinum test --diff`) and GitHub Action integration
3. Validate that LLM-synthesized test payloads are structurally valid and runnable without human intervention

## Milestones

### Milestone 1: MVP — CLI Proof of Concept on TypeScript + Python
**Status:** Queued (FEATURE-001 through FEATURE-012)
Pipeline built, synthesis quality validated on fixtures (≥80% catch rate), CLI + GitHub Action working, gap report and trust report generated.

### Milestone 2: Validated & Shareable
**Status:** Queued (FEATURE-015 through FEATURE-019)
**Exit gate — all three must be true:**
1. `optinum demo --repo <url>` runs end-to-end in < 2 min on an unfamiliar public repo
2. Blind spot catalog has ≥ 20 patterns, each backed by a real OSS evidence commit
3. Optinum's own regression suite is green (OSS benchmark locked as CI gate)

What changes after this milestone: method is proven on real-world code, not just fixtures. Monetization strategy can now be decided.

### Milestone 3: V2 (deferred — scope TBD after Milestone 2)
- Security edge case synthesis (auth bypass, IDOR, injection patterns)
- GraphQL schema support
- Multi-language beyond TS + Python

## Target Stack for V1
- TypeScript/Node.js (Zod schemas) + Python/FastAPI (Pydantic models) — both in V1
- SchemaDetector abstraction normalizes both to `EndpointContract[]` — no OpenAPI required
- GitHub PRs as the diff source

## V2 Scope (do not build now)
- Security edge case synthesis (auth bypass, boundary injection, IDOR patterns)
- GraphQL support
- Multi-language support beyond initial ecosystem
- UI/E2E layer

## Decisions on Record
[2026-03-26] | OpenAPI is not the primary schema source | AI-first projects use Zod (TS) or Pydantic (Python) — both are strictly better sources for their ecosystems. SchemaDetector replaces SpecLoader: Zod first for TS, Pydantic first for Python, OpenAPI as optional enrichment only
[2026-03-26] | V1 targets TypeScript + Python (not just TypeScript) | SchemaDetector abstraction makes both ecosystems viable in V1 — covers ~90% of AI-first projects without requiring OpenAPI
[2026-03-26] | Add AI blind spot synthesis as Layer 2 of test generation | LLMs have systematic failure patterns based on training distribution; reverse-engineering these patterns produces a test catalog that targets bugs human reviewers and schema-based tools miss entirely. This is the defensible moat.
[2026-03-26] | Monetization deferred until method is proven | Trial = local run counter (1-2 runs), no subscription infrastructure. Business model decided after FEATURE-006 validates quality. Technology first.
[2026-03-26] | OSS repos as benchmark source | Public commit histories are self-expanding, auditable benchmarks. Cross-reference with subsequent bug fixes for validation. Open source dataset builds credibility.
<!-- Append-only. Format: [date] | [decision] | [rationale] -->
[2026-03-27] | Optinum is explicitly AI-native testing, not general integration testing | Bugs that Optinum catches are ones only AI introduces: provider drift across files, async-forEach fire-and-forget, nested property access without null guards, etc. A human doing a provider swap would grep first; an LLM edits the file in scope and misses the rest. The catalog and synthesis prompts must be built from this perspective — we are looking from the outside at how AI actually writes code, not how humans write bugs. This is the core framing difference from existing tools.
[2026-03-27] | Blind spot catalog must carry aiNative flag and aiNativeReason | Each pattern needs to explain WHY an AI specifically introduces this bug (training distribution, context window scope, happy-path bias). This is what makes the catalog defensible against competitors who can replicate schema-based generation but cannot replicate the systematic analysis of how LLMs fail.
[2026-03-26] | Drop ml-engineer from roster | LLM integration is backend engineering in 2026; no training/fine-tuning in V1 — extend backend-developer.ctx.md instead
[2026-03-26] | QA has dual authority | QA participates in product synthesis as domain expert on testing methodology, not just implementation reviewer
[2026-03-26] | No researcher agent | QA covers testing methodology domain; CTO covers AST/tooling evaluation; competitive landscape already synthesized
[2026-03-26] | API/backend first, no UI testing in V1 | UI introduces DOM/visual complexity that degrades LLM synthesis reliability; AI agents are primarily generating backend code
[2026-03-26] | CLI + GitHub Action as primary interface | Developers using AI tools live in terminal and CI pipelines; SaaS dashboard is not MVP
