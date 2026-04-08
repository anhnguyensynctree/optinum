# Optinum

Detect AI coding agent blindspots in pull requests. Optinum analyzes diffs, identifies boundary changes in APIs and databases, and reports which failure patterns could occur at those boundaries — without needing your codebase to exist locally.

Run a 30-second demo:

```bash
optinum test --diff demo/cascade-blindness.diff
```

## Why This Exists

AI coding agents write code that unit tests cannot catch. Unit tests verify logic in isolation; contracts break at integration points when one piece of code changes its response but callers don't update.

**Example:** A service adds a required field to its API response. The change is "made" and returns successfully. Every endpoint that calls that service is now broken — but only at runtime. Unit tests pass on both the service (it returns the new shape) and the caller (mocked in test to return the new shape). Optinum catches this by analyzing the *actual* change boundary.

60% of AI-written test suites on SWE-bench Verified miss the exact boundary condition Optinum would catch.

## Evidence

We ran Optinum against [SWE-bench Verified](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified) — 500 real production bugs with human-verified patches across Django, sympy, scikit-learn, requests, Sphinx, and LangChain.

| Metric | Result |
|---|---|
| Pilot instances (16) with AI gap | **62.5%** — AI-written tests missed the exact failure class |
| Full 500-instance catalog coverage | **100%** — every instance maps to ≥1 catalog pattern |
| Patterns catalogued | **22** across 6 change types |
| End-to-end Docker proof | test fails on bug commit, passes on fix commit (sympy__sympy-18199) |

```
$ optinum benchmark --verify sympy__sympy-18199

  test_fails_on_bug:   true
  test_passes_on_fix:  true
  execution_verified:  true
```

Full write-up: [docs/blog-final.md](docs/blog-final.md)

## Prerequisites

- **Node 18+**
- Claude Code with subscription (optional — pattern detection works without synthesis)

## Install

```bash
npm install -g github:anhnguyensynctree/optinum
```

## Quick Start

Try the demo with zero setup:

```bash
optinum test --diff demo/cascade-blindness.diff
```

You will see:

```
TypeScript tests written to optinum-tests/generated.test.ts

Detected blind spot patterns:
  • Delete/Update Without Cascading to Related Entities
  • Event Emission Dropped During Refactor
  • Error Handler Swallows Exceptions Silently
  • Renamed API Parameters
  • Changed Response Shape
  • New Required Field Not Sent by Callers
  ...
```

## In Your Project

```bash
# Analyze your PR diff
optinum test --diff ./my-changes.diff

# Or a directory with before/ and after/ subdirectories
optinum test --diff ./changes-dir/
```

Output is written to `./optinum-tests/generated.test.ts` (TypeScript) or `./optinum-tests/generated_test.py` (Python).

Each file includes three test categories:
- **happy** — valid input, expected success
- **edge** — boundary conditions, empty input, max values
- **ai-blind-spot** — patterns AI agents systematically miss

Pattern detection works offline. Test synthesis requires Claude Code with an active subscription (falls back gracefully if unavailable).

## What It Catches

Optinum probes 30+ failure patterns across six categories:

| Pattern | Category | Severity |
|---|---|---|
| New required field not sent by callers | Contract change | Critical |
| Response shape changed, callers don't handle it | Contract change | High |
| Delete without cascading to child records | Cascade | High |
| Event emission dropped in refactor | Cascade | High |
| Auth check added but no ownership verification (IDOR) | Write endpoint | Critical |
| Multi-step operation without transaction | Write endpoint | Critical |
| ORM model updated but migration file missing | Migration | Critical |
| Async forEach with fire-and-forget | Common AI mistake | High |
| Type widened to null, callers unaware | Type change | High |

Full catalog: [blind-spot-catalog.json](src/catalog/blind-spot-catalog.json)

## How It Works

1. **Extract files from diff** — parse unified diff, identify changed TypeScript/Python files
2. **Detect boundaries** — heuristics identify if change is contract change, cascade, new write endpoint, migration, or type change
3. **Query blind spot catalog** — match detected change type to known AI failure patterns
4. **Report patterns** — print matching patterns (always works, no synthesis needed)
5. **Synthesize tests** *(optional)* — if Claude Code available, generate integration tests probing each boundary

## CI/CD Integration

Add to your GitHub Actions workflow after unit tests:

```yaml
- name: Check for AI blindspot patterns
  run: |
    npm install -g github:anhnguyensynctree/optinum
    git diff origin/main...HEAD > changes.diff
    optinum test --diff changes.diff
```

## FAQ

**What if I don't have Claude Code?**
Pattern detection works offline. You get a catalog report of which patterns *could* occur at your boundaries. Test synthesis is optional.

**Why not unit tests?**
Unit tests are mocked — if the test and code share the same wrong assumption, both pass. Optinum tests real contracts: the actual shape the upstream returns vs. what downstream expects.

**Does this replace my test suite?**
No. Run alongside unit tests, integration tests, and E2E tests. Optinum fills a specific gap: integration points that unit tests don't see because they mock both sides.

**How do I know if a pattern applies to my code?**
Optinum analyzes the diff, not your codebase. It detects the *type* of change (e.g., delete operation) and reports patterns that apply to that type. Some may not apply to your specific code — use your judgment.

**What is the synthesizer independence principle?**
If a synthesizer runs in the same context where code was written, it inherits the same mental model and misses the same blindspots. Optinum's synthesizer runs in a subprocess with only deterministic inputs: blast radius, contracts, and catalog entries. It never sees implementation details or PR descriptions.

## Extend or Fork This

Optinum is designed to be forked. The three components you would change most:

**Catalog** — `src/catalog/blind-spot-catalog.json`
Add your own patterns. Each entry needs: `id`, `name`, `changeType`, `description`, `testPattern`, `severity`. The `changeType` field is what the classifier matches against. Add a pattern, and every diff that matches its change type will surface it automatically.

**AST Parser** — `src/ast/`
`ts-parser.ts` handles TypeScript, `py-parser.ts` handles Python, `index.ts` routes by extension. Add a new parser for Go, Rust, or Ruby by implementing the same `DiffBlastRadius` output shape and registering it in the router.

**Synthesizer Prompts** — `src/synthesizer/prompts/`
`layer1.ts` generates standard tests, `layer2.ts` generates AI-blind-spot tests. Edit the prompt templates to target your framework conventions, change the test output format, or add a new synthesis layer.

**The approach in three sentences:**
Parse the diff → identify what changed and what depends on it (blast radius) → match against a catalog of patterns AI agents miss → synthesize tests that probe those boundaries from outside. The synthesizer never sees your implementation — only the boundary shape. This is what makes the tests catch what AI-authored tests miss.
