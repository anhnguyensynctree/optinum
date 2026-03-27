# Optinum

Diff-scoped integration test generation for AI-written code. Optinum analyzes the blast radius of a PR diff, detects API contracts and schema changes, and synthesizes integration tests targeting the exact boundaries that changed — including a catalog of known AI coding-agent failure patterns (blind spots).

Unit tests pass on both sides. Optinum catches what breaks in between.

## What It Does

1. Parses the AST blast radius of changed TypeScript files
2. Detects Zod/Pydantic schema contracts at changed boundaries
3. Classifies the change type (contract change, new write endpoint, cascade, migration, type widening)
4. Synthesizes three test categories per endpoint:
   - **happy** — valid payload, expected success
   - **edge** — boundary conditions and invalid input
   - **ai-blind-spot** — patterns the synthesizer knows AI agents systematically miss

Output is a single `generated.test.ts` (Jest or Vitest) dropped into `./optinum-tests/` ready to run in CI.

## Quick Start

```bash
npm install -g optinum
```

In your project root:

```bash
optinum init
```

Auto-detects ecosystem (TypeScript/Python), test runner (Jest/Vitest/pytest), and schema format (Zod/Pydantic/OpenAPI). Writes `optinum.config.ts`.

Generate tests from a diff:

```bash
# Pass a unified diff file
optinum test --diff ./my-pr.diff

# Pass a directory with before/ and after/ subdirectories
optinum test --diff ./diff-dir/

# Dry-run: print generated test file, do not write
optinum test --diff ./my-pr.diff --dry-run

# Choose test runner explicitly
optinum test --diff ./my-pr.diff --runner vitest

# Use API synthesis mode instead of CLI subprocess
optinum test --diff ./my-pr.diff --llm api

# Write output to a custom directory
optinum test --diff ./my-pr.diff --output ./ci-tests
```

The `--diff` flag accepts either a unified diff file (`.diff`, `.patch`) or a directory containing `before/` and `after/` subdirectories of TypeScript source files.

## Reading Reports

### Gap Report

After each run, Optinum prints a gap report to stdout:

```
endpoint              happy   edge  ai-blind-spot  total
-----------------------------------------------------
/api/users/update         1      2              3      6
/api/orders               1      1              2      4
-----------------------------------------------------
TOTAL                     2      3              5     10

Blind spots detected:

  • [/api/users/update] Auth Check Without Ownership Verification
  • [/api/users/update] Idempotency Key Not Sent by Callers
```

A high `ai-blind-spot` count relative to `total` means the change touched a high-risk surface (write endpoint, auth, multi-step operation). See [docs/gap-report.md](docs/gap-report.md) for column definitions and triage guidance.

### Trust Report

Trust score is derived from the ratio of blind spot tests that a synthesizer run could generate given the detected change types. See [docs/trust-report.md](docs/trust-report.md).

### Blind Spot Catalog

The full catalog of AI failure patterns is in [docs/blind-spot-catalog.md](docs/blind-spot-catalog.md).

**Quick reference:**

| Change Type | Pattern ID | Severity | What Optinum Probes |
|---|---|---|---|
| `contract-change` | `params-renamed` | high | Old parameter names still sent by callers |
| `contract-change` | `return-shape-changed` | high | Callers destructure old response shape |
| `contract-change` | `required-field-added` | critical | Callers omit newly required field |
| `contract-change` | `field-removed` | medium | Callers still send removed field |
| `contract-change` | `status-code-changed` | medium | Callers check old HTTP status code |
| `new-write-endpoint` | `idempotency-missing` | critical | Callers don't send idempotency key |
| `new-write-endpoint` | `auth-ownership-gap` | critical | Auth without ownership check (IDOR) |
| `new-write-endpoint` | `auth-check-missing` | critical | Endpoint added outside auth middleware |
| `new-write-endpoint` | `input-trust-violation` | high | Internal callers bypass HTTP sanitization |
| `new-write-endpoint` | `transaction-missing` | critical | Multi-step write without DB transaction |
| `cascade-change` | `cascade-blindness` | high | Delete/update without cascading to children |
| `cascade-change` | `event-not-emitted` | high | Event emission dropped in refactor |
| `cascade-change` | `cache-invalidation-missing` | medium | Write handler loses cache invalidation |
| `cascade-change` | `error-swallowed` | high | try/catch silently swallows exceptions |
| `schema-migration` | `migration-drift` | critical | ORM model updated, migration file missing |
| `type-widening` | `type-widening` | high | Callers don't handle new null/undefined path |

## Configuration

`optinum.config.ts` (written by `optinum init`):

```ts
import type { OptinumConfig } from "./src/config/config-schema";

const config: OptinumConfig = {
  ecosystem: "typescript",   // "typescript" | "python"
  schemaFormat: "zod",       // "zod" | "pydantic" | "openapi"
  testRunner: "jest",        // "jest" | "vitest" | "pytest"
  outputDir: "./optinum-tests",
};

export default config;
```

## CI Integration

Add to your CI pipeline after your existing test step:

```yaml
- name: Generate integration tests
  run: |
    git diff origin/main...HEAD > pr.diff
    optinum test --diff pr.diff

- name: Run Optinum tests
  run: npx jest ./optinum-tests/generated.test.ts
```

## FAQ

**Is this replacing my test suite?**
No — Optinum generates diff-scoped integration tests as a CI step. It runs alongside your existing unit and E2E suites, not instead of them. Unit tests verify logic in isolation; Optinum verifies the contracts between components at the boundaries that actually changed.

**Why not just write more unit tests?**
Unit tests pass on both sides of a breaking contract change. Optinum traverses the call graph upward from the changed code and generates tests for every caller. This is the class of bug it exists to catch: correct in isolation, broken in integration, invisible to unit tests.

**Does it work with Python?**
The classifier and catalog are language-agnostic. Schema detection supports Pydantic. Test runner output targets pytest. TypeScript AST parsing is more mature in V1.

**What is the synthesizer independence principle?**
The test synthesizer runs in an isolated subprocess (fresh context). It receives only the deterministic pipeline outputs — blast radius, contracts, change types, and catalog entries — never the implementation code or PR description. This isolation is the mechanism of detection: a synthesizer that shares the developer session shares its assumptions and misses the same blind spots.

**How do I get more blind spot coverage?**
Ensure `optinum init` correctly detects your schema format. Zod and Pydantic schemas give the synthesizer structured contract information to probe. OpenAPI fallback is less precise.

## Docs

- [Gap Report](docs/gap-report.md) — column definitions, triage, interpreting counts
- [Trust Report](docs/trust-report.md) — trust score definition and what drives it
- [Blind Spot Catalog](docs/blind-spot-catalog.md) — full pattern catalog with descriptions and test strategies
