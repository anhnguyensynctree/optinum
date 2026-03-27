# 2026-03-26-elaborate-all-features: /oms all — elaborate all 20 draft features
Date: 2026-03-26  Tier: 2  Domain Lead: CTO  Agents: CTO, Backend Developer, QA Engineer  Rounds: 2
Pre-mortem: under-scoped tasks that block dependencies / over-scoped tasks that need splitting / missing artifact declarations

## Router Output
task_id: 2026-03-26-elaborate-all-features
tier: 2
activated_agents: [cto, backend-developer, qa-engineer]
domain_lead: cto
primary_recommender: cto
complexity: compound — 20 features across 2 milestones, mixed impl/research types, 3 departments
round_cap: 2
triz_contradiction: minimize task scope (atomic, executable) vs maximize completeness (full OpenSpec)
premortem_failure_modes: [missing-dependency-edges, artifact-paths-too-vague, scenarios-not-testable, task-too-large-not-flagged]

## Round 1 — NGT Blind

### CTO Position
Pipeline features (FEATURE-001 through FEATURE-009) form a strict dependency chain. Every task must declare exact file paths. ASTParser must be split by language (TS/Python) because ts-morph and ast+libcst are entirely different implementations — combining them into one task prevents parallel work. SchemaDetector similarly split. TestSynthesizer should be split: core synthesis (Layer 1) separate from blind spot integration (Layer 2) because Layer 2 depends on FEATURE-009 ChangeClassifier which doesn't exist until after synthesis is scaffolded.

Three-Loop Self-Validation (FEATURE-020) must be split into 3 tasks — inner/middle/outer are independent runtime components. If they're one task the implementer won't know where to start.

Trial counter (FEATURE-013) is Tier 0 — a 2-hour task. Single TASK block, small.

### Backend Developer Position
Key implementation concerns:
- FEATURE-002 ASTParser: split TS/Python. ts-morph referencesTo() for upward is non-trivial — needs its own task so the Python implementer can work in parallel.
- FEATURE-004 TestSynthesizer: self-correction loop is a separate concern from synthesis. Split into synthesis core + retry/validation loop. The retry loop uses Haiku (not Sonnet) — separate billing profile.
- FEATURE-008 GitHub Action: this is mostly a YAML wrapper around the CLI — single small task, depends on FEATURE-007.
- FEATURE-015 optinum init: needs a Zod config schema defined first, then the CLI command reads it. Could be one task but need to call out the schema artifact explicitly.
- FEATURE-013 trial counter: store in ~/.optinum/config.json, counter key is `synthRuns`. After 2: print message, exit 1. ~30 lines of code.

### QA Engineer Position
QA concerns for task sizing:
- Every synthesis task needs explicit Verify fields that reference fixture catch rate — not just "it compiles."
- FEATURE-005 (Fixture Set) is already largely done via FEATURE-021 (fixtures exist). FEATURE-005 needs one task: a fixture validation harness that loads expected-output.json and verifies Optinum's output matches.
- FEATURE-006 Quality Gate must have specific numeric thresholds in Scenarios: ≥80% catch rate, <20% false positive, 100% structural validity. These are gates, not aspirations.
- FEATURE-009 Blind Spot Catalog: the catalog JSON is a living artifact. It needs a schema (JSON Schema or Zod), not just an example file. QA gates on this.
- FEATURE-018 Regression Suite: CI gate task must produce a GitHub Actions workflow that actually blocks merges — not just a report.

## Facilitator
Short-circuit: consensus on split points. No disagreement on tier or dependencies. Synthesize directly.

## Synthesis
31 tasks total. Dependency graph clean. All task splits agreed by all 3 agents.
