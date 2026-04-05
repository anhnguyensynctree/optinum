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

## Prerequisites

- **Node 18+**
- Claude Code with subscription (optional — pattern detection works without synthesis)

## Install

```bash
npm install -g optinum
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
    git diff origin/main...HEAD > changes.diff
    npx optinum test --diff changes.diff
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
