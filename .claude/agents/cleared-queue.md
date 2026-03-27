# Cleared Queue — Optinum

<!-- Tasks appended by /oms-exec and elaborated by /oms all. -->

---

## TASK-001
**Title:** Pipeline I/O Types
**Status:** done
**Feature:** FEATURE-001
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** small
**Gate:** no-gate
**Depends-on:** []

**Spec:** The system SHALL define all shared TypeScript types as Zod schemas with derived `z.infer<>` types in `src/types/pipeline.ts`, establishing the single source of truth for the entire synthesis pipeline.

**Scenarios:**
1. Given the pipeline types file / When ASTParser, SchemaDetector, TestSynthesizer, and CLI import from `src/types/pipeline.ts` / Then all imports resolve without TypeScript errors
2. Given a `DiffBlastRadius` value / When passed to SchemaDetector / Then TypeScript confirms it matches the declared shape with `changed`, `dependents`, `dependencies` arrays of `FunctionNode`
3. Given a `SynthesizedTest` value at runtime / When validated / Then Zod rejects any object missing `testId`, `endpoint`, `caseType`, `payload`, `expectedStatus`, or `expectedShape`

**Artifacts:**
- `src/types/pipeline.ts`

**Produces:** Shared type module imported by all other pipeline modules

**Verify:** `tsc --noEmit` passes with zero errors across all modules that import `src/types/pipeline.ts`

---

## TASK-002
**Title:** ASTParser — TypeScript (ts-morph bidirectional traversal)
**Status:** done
**Feature:** FEATURE-002
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-001]

**Spec:** The system SHALL implement a TypeScript ASTParser using ts-morph that parses a unified diff, extracts changed function nodes, and performs bidirectional traversal: upward via `referencesTo()` (all callers across the codebase, 1-2 levels) and downward via call graph (what the changed function calls, 1-2 levels), returning a `DiffBlastRadius`.

**Scenarios:**
1. Given a diff modifying `after/src/api/questionnaire/route.ts` / When ASTParser runs / Then `dependents` includes `after/src/home/actions.ts` and `after/src/onboarding/actions.ts`
2. Given a changed function with >20 upward dependents / When ASTParser runs / Then it sets `highFanOut: true` and logs a warning without failing
3. Given a pure utility with no callers / When ASTParser runs / Then `dependents` is empty and `dependencies` reflects what the utility calls
4. Given a malformed diff / When ASTParser runs / Then it returns `PipelineError { stage: "ast-parser" }` without throwing

**Artifacts:**
- `src/ast/ts-parser.ts`
- `src/ast/ts-parser.test.ts`

**Produces:** `DiffBlastRadius` from a unified diff of TypeScript files

**Verify:** Tests pass; fixture-001 upward traversal catches both `home/actions.ts` and `onboarding/actions.ts`

---

## TASK-003
**Title:** ASTParser — Python (ast + libcst bidirectional traversal)
**Status:** done
**Feature:** FEATURE-002
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-001]

**Spec:** The system SHALL implement a Python ASTParser using `ast` and `libcst` that performs bidirectional traversal for Python files, outputting the same `DiffBlastRadius` JSON shape as TASK-002.

**Scenarios:**
1. Given a Python diff modifying a FastAPI route function / When Python ASTParser runs / Then `dependents` includes all Python files that import and call the changed function
2. Given a Pydantic model class change / When ASTParser runs / Then `changed` captures the model class and `dependents` captures all files that instantiate or import it
3. Given a Python file using `from module import *` / When ASTParser runs / Then it logs `wildcard-import-warning` and excludes that file from upward traversal with a note
4. Given a diff with only comment changes / When ASTParser runs / Then `changed` and `dependents` are both empty

**Artifacts:**
- `src/ast/py-parser.py`
- `src/ast/py-parser-test.py`

**Produces:** `DiffBlastRadius` (as JSON) from a unified diff of Python files

**Verify:** Python tests pass against a FastAPI fixture diff; upward traversal identifies callers of a changed Pydantic model

---

## TASK-004
**Title:** SchemaDetector — TypeScript (Zod → interfaces → OpenAPI)
**Status:** done
**Feature:** FEATURE-003
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-001]

**Spec:** The system SHALL implement a TypeScript SchemaDetector that, given file paths from `DiffBlastRadius`, auto-detects schema source (Zod first, TypeScript interfaces fallback, OpenAPI enrichment only) and normalizes all sources to `EndpointContract[]`.

**Scenarios:**
1. Given a TS project with `z.object()` schemas colocated in changed files / When SchemaDetector runs / Then it extracts Zod fields and returns `EndpointContract[]` without consulting OpenAPI
2. Given no Zod schemas but exported TypeScript interfaces / When SchemaDetector runs / Then it falls back to interface extraction with `source: "ts-interface"`
3. Given an `openapi.yaml` at root and also Zod schemas / When SchemaDetector runs / Then Zod takes priority; OpenAPI fields merged as `enrichment` only
4. Given no Zod, no interfaces, no OpenAPI / When SchemaDetector runs / Then it returns `EndpointContract[]` with `fields: []` and logs `schema-not-found`

**Artifacts:**
- `src/schema/ts-schema-detector.ts`
- `src/schema/ts-schema-detector.test.ts`

**Produces:** `EndpointContract[]` from TypeScript project files

**Verify:** Tests pass; fixture-001 returns `{ mode: enum, sessionId: uuid }` from the Zod schema

---

## TASK-005
**Title:** SchemaDetector — Python (Pydantic → OpenAPI)
**Status:** done
**Feature:** FEATURE-003
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-001]

**Spec:** The system SHALL implement a Python SchemaDetector that scans Python files in `DiffBlastRadius` for Pydantic `BaseModel` subclasses and normalizes them to `EndpointContract[]`; falls back to FastAPI-generated OpenAPI if no Pydantic model is found.

**Scenarios:**
1. Given a Python diff touching `class RequestBody(BaseModel)` / When Python SchemaDetector runs / Then it extracts all field names and types and returns `EndpointContract[]`
2. Given no Pydantic model but a generated `openapi.json` / When SchemaDetector runs / Then it returns `EndpointContract[]` with `source: "openapi"`
3. Given a Pydantic model with `Optional[str]` fields / When SchemaDetector runs / Then those fields are marked `required: false`
4. Given no Pydantic models and no OpenAPI / When SchemaDetector runs / Then it returns `EndpointContract[]` with `fields: []` and logs `schema-not-found`

**Artifacts:**
- `src/schema/py-schema-detector.py`
- `src/schema/py-schema-detector-test.py`

**Produces:** `EndpointContract[]` (as JSON) from Python project files

**Verify:** Tests pass against a FastAPI/Pydantic fixture; Pydantic fields correctly typed in output

---

## TASK-006
**Title:** TestSynthesizer — Core Synthesis (Layer 1, schema-grounded)
**Status:** queued
**Feature:** FEATURE-004
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** large
**Gate:** ceo-gate
**Depends-on:** [TASK-002, TASK-003, TASK-004, TASK-005]

**Spec:** The system SHALL implement the TestSynthesizer core that calls the Claude API in JSON schema structured output mode, taking `DiffBlastRadius` + `EndpointContract[]` and producing `SynthesizedTest[]` covering happy path, boundary conditions, edge cases, and auth checks.

**Scenarios:**
1. Given `DiffBlastRadius` and `EndpointContract` for `POST /api/questionnaire { mode: enum, sessionId: uuid }` / When TestSynthesizer runs / Then it returns: one happy-path test, one boundary test (missing required field → 400), one edge test (invalid enum value)
2. Given structured output mode / When Claude API call completes / Then response conforms to `SynthesizedTest[]` JSON schema with no free-form text
3. Given a `DiffBlastRadius` with upward dependents not in the diff / When synthesis runs / Then it generates contract tests for each dependent verifying they send the updated contract fields
4. Given validation run (not synthesis) / When model is selected / Then Haiku is used for retry; Sonnet used for primary synthesis; model used is logged per call

**Artifacts:**
- `src/synthesizer/synthesizer.ts`
- `src/synthesizer/synthesizer.test.ts`
- `src/synthesizer/prompts/layer1.ts`

**Produces:** `SynthesizedTest[]` for all changed paths and their blast radius

**Verify:** Tests pass; fixture-001 synthesis produces tests 001-A and 001-B; tests 001-C and 001-D generated for upward dependents

---

## TASK-007
**Title:** TestSynthesizer — Self-Correction Loop
**Status:** queued
**Feature:** FEATURE-004
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-006]

**Spec:** The system SHALL implement a self-correction loop that re-prompts the API with the validation error when synthesized output fails JSON schema validation, using Haiku for retry calls; surfaces `PipelineError` after 2 failed retries without a third call.

**Scenarios:**
1. Given the API returns output failing `SynthesizedTest[]` schema validation / When the correction loop runs / Then it re-prompts with the error message and invalid output, using Haiku
2. Given two consecutive retry failures / When a third attempt would run / Then the loop returns `PipelineError { stage: "synthesizer", retries: 2, lastOutput }` without a third call
3. Given a retry succeeds on attempt 2 / When the loop completes / Then valid output is returned with `retryCount: 1` logged
4. Given a network timeout / When caught / Then it enters the retry loop with `retryReason: "network-error"`

**Artifacts:**
- `src/synthesizer/retry.ts`
- `src/synthesizer/retry.test.ts`

**Produces:** Hardened synthesis output with retry logic; `PipelineError` on exhaustion

**Verify:** Unit test: inject schema-failing mock response → verify retry fires exactly twice → third failure returns `PipelineError`

---

## TASK-008
**Title:** TestSynthesizer — Blind Spot Layer Integration (Layer 2)
**Status:** queued
**Feature:** FEATURE-004
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-006, TASK-015]

**Spec:** The system SHALL extend TestSynthesizer to inject relevant blind spot patterns from ChangeClassifier into the synthesis prompt, producing additional `SynthesizedTest` entries tagged `caseType: "ai-blind-spot"` alongside Layer 1 tests.

**Scenarios:**
1. Given ChangeClassifier outputs `changeType: "contract-change"` / When Layer 2 runs / Then it produces tests for each upward dependent verifying they send updated contract fields, tagged `caseType: "ai-blind-spot"`
2. Given `changeType: "new-write-endpoint"` / When blind spot synthesis runs / Then it generates: idempotency test, auth ownership test, cascade test
3. Given no catalog entry for the detected `changeType` / When Layer 2 runs / Then it skips blind spot synthesis and logs `no-catalog-entry`
4. Given full pipeline on fixture-001 / When both layers complete / Then tests 001-C and 001-D appear with `caseType: "ai-blind-spot"` and `expectedResult: "FAIL"`

**Artifacts:**
- `src/synthesizer/prompts/layer2.ts`
- `src/synthesizer/synthesizer.ts` (updated)
- `src/synthesizer/layer2.test.ts`

**Produces:** `SynthesizedTest[]` with both Layer 1 and Layer 2 tests; blind spot tests tagged distinctly

**Verify:** Fixture-001 full run produces all 4 expected tests; 001-C and 001-D have `caseType: "ai-blind-spot"`

---

## TASK-009
**Title:** Fixture Validation Harness
**Status:** done
**Feature:** FEATURE-005
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-001]

**Spec:** The system SHALL implement a fixture validation harness that loads each fixture's `expected-output.json`, runs the Optinum pipeline against the fixture's `after/` directory, and asserts blast radius dependents found, change type classified, all expected test IDs generated, and `expectedResult: "FAIL"` tests fail on unmodified `after/` code.

**Scenarios:**
1. Given fixture-001 / When the harness runs / Then it confirms `home/actions.ts` and `onboarding/actions.ts` in `dependents`, tests 001-C and 001-D generated, and both tests fail
2. Given `expectedResult: "FAIL"` tests / When those tests run against unmodified `after/` code / Then the harness records them as FAIL (not test infrastructure errors) and the fixture passes
3. Given a fixture with `missingArtifact` field (e.g., fixture-010) / When the harness runs / Then it checks for the absence of that artifact and fails if present
4. Given all 15 fixtures run in sequence / When complete / Then it outputs a table: fixture name, blast radius match, tests generated count, FAIL tests confirmed count

**Artifacts:**
- `src/fixtures/harness.ts`
- `src/fixtures/harness.test.ts`
- `fixtures/` (15 directories — already exist)

**Produces:** Fixture validation report; pass/fail per fixture; usable as CI gate

**Verify:** Harness on fixture-001 correctly identifies 2 broken callers and confirms 001-C/001-D fail

---

## TASK-010
**Title:** Synthesis Quality Gate
**Status:** queued
**Feature:** FEATURE-006
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** ceo-gate
**Depends-on:** [TASK-008, TASK-009]

**Spec:** The system SHALL run the synthesis pipeline against all 15 fixtures and gate continuation on: ≥80% catch rate, <20% false positive rate, 100% structural validity.

**Scenarios:**
1. Given all 15 fixtures run through full pipeline / When catch rate ≥80% / Then gate passes with per-fixture breakdown report
2. Given blind spot tests generated but asserting wrong fields / When catch rate is evaluated / Then that fixture counts as a miss (QA rule: tests that run but don't detect the bug are misses)
3. Given a synthesized test with syntax error or invalid JSON payload / When structural validity is checked / Then it fails the 100% gate regardless of catch rate
4. Given catch rate is 75% / When the gate fails / Then it outputs: which fixtures missed, which blind spot patterns failed, suggested prompt improvements

**Artifacts:**
- `src/quality/gate.ts`
- `src/quality/gate.test.ts`
- `src/quality/gate-report.ts`

**Produces:** `QualityGateResult { catchRate, falsePositiveRate, structuralValidity, passed, perFixture[] }` + printable report

**Verify:** Gate runs on all 15 fixtures; passes if catch rate ≥80%; blocks TASK-011 (CLI) if gate fails

---

## TASK-011
**Title:** CLI — `optinum test` command
**Status:** queued
**Feature:** FEATURE-007
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-010]

**Spec:** The system SHALL implement the `optinum test` CLI command that accepts `--diff <pr-url|diff-file>`, auto-detects ecosystem and schema format, runs the full synthesis pipeline, and writes test files to `./optinum-tests/` (or `--output <dir>`).

**Scenarios:**
1. Given `npx optinum test --diff ./diff.patch` in a TS project with Zod / When run / Then it writes `.test.ts` files to `./optinum-tests/` and prints: "N tests generated (X happy, Y edge, Z ai-blind-spot)"
2. Given `--runner vitest` / When tests are written / Then they use Vitest imports instead of Jest
3. Given `--dry-run` / When run / Then test content prints to stdout but no files are written
4. Given a GitHub PR URL as `--diff` / When run / Then it fetches the PR diff via GitHub API (requires `GITHUB_TOKEN`) and proceeds
5. Given no config file and no flags / When `optinum test` runs / Then it prints "Run `optinum init` first" and exits 1

**Artifacts:**
- `src/cli/index.ts`
- `src/cli/commands/test.ts`
- `src/cli/test.test.ts`
- `bin/optinum.js`
- `package.json` (bin field)

**Produces:** Runnable CLI; test files written to output directory

**Verify:** `npx optinum test --diff fixtures/fixture-001-contract-change/` produces 4 test files; `--dry-run` prints without writing

---

## TASK-012
**Title:** CLI — Output Formatter + Summary
**Status:** queued
**Feature:** FEATURE-007
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-011]

**Spec:** The system SHALL implement a CLI output formatter that prints a human-readable run summary including test count by case type, coverage breakdown, and quality gate warnings.

**Scenarios:**
1. Given synthesis completes with 8 tests across 3 endpoints / When formatter runs / Then it prints a table: endpoint, case types generated, `ai-blind-spot` count highlighted
2. Given `ai-blind-spot` tests generated / When formatter outputs / Then it includes a "Blind spots detected" section listing each pattern by name
3. Given synthesis fails for one endpoint (pipeline error) / When formatter runs / Then it prints the error with stage name and suggests `--debug`
4. Given `--json` flag / When formatter runs / Then it outputs raw `PipelineResult` as JSON to stdout

**Artifacts:**
- `src/cli/formatter.ts`
- `src/cli/formatter.test.ts`

**Produces:** Formatted CLI output; `--json` mode for machine consumption

**Verify:** Unit tests cover table output and JSON mode; visual check on fixture-001 output

---

## TASK-013
**Title:** GitHub Action Wrapper
**Status:** queued
**Feature:** FEATURE-008
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-011]

**Spec:** The system SHALL provide a GitHub Actions workflow that triggers on `pull_request`, runs `optinum test`, and posts synthesized tests as a collapsible PR comment.

**Scenarios:**
1. Given a PR opened or updated / When the action runs / Then it calls `optinum test --diff $PR_URL --json` and posts output as a PR comment with `<details>` collapsible block
2. Given `ANTHROPIC_API_KEY` secret not set / When action runs / Then it fails: "ANTHROPIC_API_KEY secret is required — add it in repo Settings → Secrets"
3. Given synthesis catch rate below threshold and `--fail-on-threshold` set / When action runs / Then it exits 1 and blocks the PR
4. Given `OPENAPI_SPEC_PATH` input provided / When action runs / Then it passes `--spec <path>` to CLI; if absent, auto-detection runs

**Artifacts:**
- `.github/workflows/optinum.yml`
- `action.yml`

**Produces:** Reusable GitHub Action; PR comment with synthesized tests on every PR

**Verify:** Action YAML is valid; PR comment renders correctly with collapsible test block

---

## TASK-014
**Title:** Blind Spot Catalog — JSON Schema + Initial Entries
**Status:** done
**Feature:** FEATURE-009
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-001]

**Spec:** The system SHALL define the Blind Spot Catalog as a JSON Schema-validated file at `src/catalog/blind-spot-catalog.json` with at least 5 patterns per supported change type, each containing `name`, `changeType`, `description`, `testPattern`, and `ossEvidence` (nullable for initial entries).

**Scenarios:**
1. Given the catalog JSON / When validated against catalog JSON Schema / Then all entries pass without errors
2. Given `changeType: "contract-change"` queried / When catalog returns results / Then patterns include at minimum: `params-renamed`, `return-shape-changed`, `required-field-added`, `field-removed`, `status-code-changed`
3. Given `changeType: "new-write-endpoint"` queried / When catalog returns results / Then patterns include: `idempotency-missing`, `auth-ownership-gap`, `input-trust-violation`, `cascade-blindness`, `transaction-missing`
4. Given a pattern with `ossEvidence: null` / When catalog loads / Then it is marked `provisional: true` and excluded from public catch rate claims

**Artifacts:**
- `src/catalog/blind-spot-catalog.json`
- `src/catalog/catalog-schema.json`
- `src/catalog/catalog.ts`
- `src/catalog/catalog.test.ts`

**Produces:** Validated blind spot catalog; typed catalog loader module

**Verify:** All entries pass JSON Schema; catalog loads without errors; query by `changeType` returns correct patterns

---

## TASK-015
**Title:** ChangeClassifier Module
**Status:** done
**Feature:** FEATURE-009
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-002, TASK-003]

**Spec:** The system SHALL implement a deterministic ChangeClassifier that takes `DiffBlastRadius` and returns `ChangeType[]` using AST-based heuristics (no LLM calls).

**Scenarios:**
1. Given a diff where the Zod schema added a required field and removed another / When ChangeClassifier runs / Then it returns `["contract-change"]`
2. Given a new `async function POST()` added to a route file / When ChangeClassifier runs / Then it returns `["new-write-endpoint"]`
3. Given a `DELETE` route handler changed / When ChangeClassifier runs / Then it returns `["new-delete-operation"]`
4. Given mixed changes (schema rename + new auth middleware) / When ChangeClassifier runs / Then it returns `["contract-change", "new-auth-check"]`
5. Given an ambiguous diff matching no heuristic / When ChangeClassifier runs / Then it returns `["unknown"]` and logs `classification-miss`

**Artifacts:**
- `src/classifier/change-classifier.ts`
- `src/classifier/change-classifier.test.ts`
- `src/classifier/heuristics/` (one file per change type)

**Produces:** `ChangeType[]` from `DiffBlastRadius`; deterministic, zero API calls

**Verify:** All 6 supported change types correctly classified from representative inputs; fixture-001 classified as `"contract-change"`

---

## TASK-016
**Title:** OSS Benchmark Runner
**Status:** queued
**Feature:** FEATURE-010
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** large
**Gate:** ceo-gate
**Depends-on:** [TASK-002, TASK-015]

**Spec:** The system SHALL implement `optinum benchmark --repo <url> --range <from>..<to>` that runs blast radius detection and ChangeClassifier across a commit range of a public GitHub repo and outputs a versioned `BenchmarkRecord` per commit.

**Scenarios:**
1. Given a public GitHub repo and commit range / When benchmark runs / Then it produces one `BenchmarkRecord` per commit with `repo`, `commitSha`, `changeTypes[]`, `blindSpotsDetected[]`, `laterFixCommit?`, `bugSignal?`
2. Given a commit touching a Zod schema file / When SchemaDetector runs in the benchmark / Then schema source is captured in the record
3. Given a later commit fixes the same files / When cross-reference runs / Then `laterFixCommit` SHA is set and `bugSignal: "regression-fix"`
4. Given benchmark completes for 3 repos / When results written / Then saved to `benchmark/results/` as versioned JSON with a `benchmark-index.json`

**Artifacts:**
- `src/benchmark/runner.ts`
- `src/benchmark/runner.test.ts`
- `src/benchmark/cross-reference.ts`
- `src/cli/commands/benchmark.ts`
- `benchmark/results/`

**Produces:** Versioned benchmark dataset; `benchmark-index.json`; ground truth for catch rate claims

**Verify:** Benchmark runs against 1 public TS repo with 20+ commits; produces valid `BenchmarkRecord[]`

---

## TASK-017
**Title:** OSS Benchmark Cross-Reference Engine
**Status:** queued
**Feature:** FEATURE-010
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-016]

**Spec:** The system SHALL implement a cross-reference engine that enriches benchmark records by scanning subsequent commits and GitHub issues for signals that flagged blind spots were real bugs.

**Scenarios:**
1. Given a benchmark record flagging `idempotency-missing` / When cross-reference runs / Then it scans commits A+1 through A+50 and sets `laterFixCommit` if found
2. Given a repo with GitHub issues / When cross-reference runs / Then it queries GitHub API for issues mentioning changed function names; sets `bugSignal: "issue-linked"` if found
3. Given no later fix and no linked issue / When cross-reference completes / Then `laterFixCommit: null` and `bugSignal: null` are set (not omitted)
4. Given GitHub API rate limit hit / When cross-reference runs / Then it retries with exponential backoff and logs a warning; does not fail the run

**Artifacts:**
- `src/benchmark/cross-reference.ts`
- `src/benchmark/cross-reference.test.ts`

**Produces:** Enriched `BenchmarkRecord[]` with `laterFixCommit` and `bugSignal` populated

**Verify:** Cross-reference links a known fix commit in a test fixture repo; rate limit handling tested with a mock

---

## TASK-018
**Title:** Coverage Trust Report Generator
**Status:** done
**Feature:** FEATURE-011
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-015, TASK-019]

**Spec:** The system SHALL generate a Coverage Trust Report after every synthesis run containing: blind spots detected by category, existing test coverage per blind spot, estimated risk level, benchmark comparison — output as GitHub PR comment (collapsible) and standalone HTML.

**Scenarios:**
1. Given `contract-change` and `idempotency-missing` blind spots detected / When trust report generates / Then it lists both with: description, risk level, "your tests cover this: yes/no"
2. Given Gap Analyzer shows 3 of 5 changed paths have no test coverage / When report generates / Then it includes "3 of 5 changed paths have zero test coverage" in summary
3. Given benchmark data available / When report generates / Then it includes "N patterns matching known failure types in the OSS benchmark"
4. Given `--format html` / When trust report generates / Then it writes `optinum-report.html` to output directory
5. Given free tier (no OPTINUM_API_KEY) / When report generates / Then full gap analysis shows but no synthesized test files

**Artifacts:**
- `src/report/trust-report.ts`
- `src/report/trust-report.test.ts`
- `src/report/templates/github-comment.ts`
- `src/report/templates/html-report.ts`

**Produces:** Trust report as GitHub comment markdown and HTML; free-tier gap report

**Verify:** Trust report generates from fixture-001 run; GitHub comment markdown renders; HTML is valid

---

## TASK-019
**Title:** Unit Test Gap Analyzer
**Status:** done
**Feature:** FEATURE-012
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-002, TASK-015]

**Spec:** The system SHALL implement a Gap Analyzer that scans existing test files for coverage of functions in `DiffBlastRadius`, producing per-function coverage report with zero LLM calls.

**Scenarios:**
1. Given `DiffBlastRadius` with 5 changed functions / When Gap Analyzer runs / Then it outputs `{ function, testedDirectly: bool, blindSpotsWithoutCoverage: string[] }` per function
2. Given a test file that imports and calls a function in blast radius / When Gap Analyzer scans / Then `testedDirectly: true`
3. Given blind spot category `idempotency` / When Gap Analyzer searches tests / Then it looks for duplicate POST calls and 409 assertions; if none, adds "idempotency" to `blindSpotsWithoutCoverage`
4. Given a function with no test file mentioning it by name / When Gap Analyzer runs / Then `testedDirectly: false` — primary "aha moment" signal
5. Given no test files exist in project / When Gap Analyzer runs / Then all `testedDirectly: false` with `no-tests-found` warning

**Artifacts:**
- `src/analyzer/gap-analyzer.ts`
- `src/analyzer/gap-analyzer.test.ts`

**Produces:** `GapReport { function, testedDirectly, blindSpotsWithoutCoverage }[]`; zero LLM calls

**Verify:** Correctly identifies uncovered functions in fixture-001; false positive rate on directly-tested functions is 0%

---

## TASK-020
**Title:** Trial Run Counter
**Status:** queued
**Feature:** FEATURE-013
**Milestone:** deferred — build after method is proven
**Departments:** [engineering]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-011]

**Spec:** The system SHALL implement a local trial run counter in `~/.optinum/config.json` that blocks synthesis after 2 full runs, printing "Trial limit reached — add OPTINUM_API_KEY to continue" and exiting 1.

**Scenarios:**
1. Given `~/.optinum/config.json` does not exist / When first synthesis run starts / Then it creates file with `{ synthRuns: 0 }` and increments to 1 on completion
2. Given `synthRuns: 1` / When second run completes / Then counter increments to 2, synthesis proceeds
3. Given `synthRuns: 2` / When third run is attempted / Then it prints trial message and exits 1 before any API calls
4. Given `OPTINUM_API_KEY` env var set / When synthesis runs / Then counter check is bypassed entirely

**Artifacts:**
- `src/cli/trial.ts`
- `src/cli/trial.test.ts`

**Produces:** Trial gate; counter persisted to user home directory

**Verify:** First run creates file; second run increments; third run blocks; API key bypass tested

---

## TASK-021
**Title:** `optinum init` Command + Config Schema
**Status:** queued
**Feature:** FEATURE-015
**Milestone:** Validated & Shareable
**Departments:** [engineering]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-011]

**Spec:** The system SHALL implement `optinum init` that auto-detects ecosystem, schema format, and test runner and writes a Zod-validated `optinum.config.ts`; subsequent `optinum test` runs load this config without requiring CLI flags.

**Scenarios:**
1. Given a TS project with `"vitest"` in devDependencies / When `optinum init` runs / Then it writes `optinum.config.ts` with `{ ecosystem: "typescript", schemaFormat: "zod", testRunner: "vitest", outputDir: "./optinum-tests" }`
2. Given a Python project with `pydantic` in `pyproject.toml` / When `optinum init` runs / Then it writes config with `{ ecosystem: "python", schemaFormat: "pydantic", testRunner: "pytest" }`
3. Given `optinum.config.ts` already exists / When `optinum init` runs again / Then it prompts "Config already exists — overwrite? (y/n)" and exits without overwriting on n
4. Given no `optinum.config.ts` at project root / When `optinum test` starts / Then it prints "Run `optinum init` first" and exits 1

**Artifacts:**
- `src/cli/commands/init.ts`
- `src/cli/commands/init.test.ts`
- `src/config/config-schema.ts`
- `src/config/config-loader.ts`

**Produces:** `optinum init` command; `optinum.config.ts` at project root; config loader used by all CLI commands

**Verify:** `optinum init` writes valid config in a test TS project; `optinum test` reads it without flags

---

## TASK-022
**Title:** Blind Spot Catalog Expansion Tooling
**Status:** queued
**Feature:** FEATURE-016
**Milestone:** Validated & Shareable
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-014, TASK-016]

**Spec:** The system SHALL provide tooling to run the OSS benchmark, identify blind spot patterns fired, link them to OSS evidence commits, and expand the catalog to ≥20 patterns each with a populated `ossEvidence` field after QA sign-off.

**Scenarios:**
1. Given the benchmark runner has processed 5+ repos / When catalog expansion tooling runs / Then it generates `catalog-expansion-candidates.json` listing new patterns with evidence commits
2. Given a candidate that fired and has a later fix commit / When cross-reference confirms it / Then it's added with `crossRefConfirmed: true`
3. Given 20 patterns in the final catalog / When validated / Then every entry has non-null `ossEvidence` with `repo`, `commitSha`, `bugDescription`
4. Given a pattern with `ossEvidence: null` / When used in catch rate claims / Then it's excluded and marked `provisional: true`

**Artifacts:**
- `src/catalog/expand.ts`
- `src/catalog/expand.test.ts`
- `src/catalog/blind-spot-catalog.json` (updated ≥20 entries)

**Produces:** Expanded catalog ≥20 evidence-backed patterns; `catalog-expansion-candidates.json` for QA review

**Verify:** Catalog has ≥20 entries; all pass JSON Schema; ≥15 have non-null `ossEvidence`

---

## TASK-023
**Title:** OSS Evidence Collection (5 Seed Repos)
**Status:** queued
**Feature:** FEATURE-016
**Milestone:** Validated & Shareable
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-016, TASK-017]

**Spec:** The system SHALL seed the OSS benchmark with 5+ TypeScript and Python repos, run the benchmark against them, and produce a documented evidence record for each blind spot pattern fired.

**Scenarios:**
1. Given 3 TS repos and 2 Python repos selected / When benchmark runs against all 5 / Then each produces `BenchmarkRecord[]` saved to `benchmark/results/`
2. Given at least one repo has a `contract-change` blind spot commit / When evidence documented / Then record includes: repo, commitSha, changed function, affected callers, later fix commit if exists
3. Given QA signs off on a pattern / When approved / Then `ossEvidence` field in catalog is populated with the verified commit data
4. Given seed repos committed to `benchmark/seed-repos.json` / When `optinum benchmark --seed` runs / Then all 5 repos are processed without additional config

**Artifacts:**
- `benchmark/seed-repos.json`
- `benchmark/results/` (one JSON per repo run)
- `benchmark/evidence/` (QA sign-off records)

**Produces:** Documented evidence base for ≥15 catalog patterns; seed repo list for reproducible benchmarks

**Verify:** All 5 repos produce valid benchmark records; ≥1 contract-change evidence commit documented with QA sign-off

---

## TASK-024
**Title:** `optinum catalog add` Command
**Status:** done
**Feature:** FEATURE-017
**Milestone:** Validated & Shareable
**Departments:** [engineering]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-014]

**Spec:** The system SHALL implement `optinum catalog add --repo <url> --commit <sha> --description <text>` that scaffolds a new pattern entry in `catalog/pending/` ready for QA review.

**Scenarios:**
1. Given `optinum catalog add --repo github.com/user/repo --commit abc123 --description "..."` / When run / Then it creates `catalog/pending/auth-ownership-abc123.json` with template populated and `evidence: null`
2. Given scaffolded entry has `changeType: "unknown"` / When command completes / Then it prints "Set changeType manually in the file before submitting for review"
3. Given `--repo` and `--commit` provided but commit doesn't exist on GitHub / When run / Then it prints a warning but still creates the pending file with `crossRefConfirmed: false`

**Artifacts:**
- `src/cli/commands/catalog-add.ts`
- `src/cli/commands/catalog-add.test.ts`
- `catalog/pending/`

**Produces:** `optinum catalog add` command; scaffolded pending pattern entries

**Verify:** Command creates valid JSON in `catalog/pending/`; file passes catalog JSON Schema

---

## TASK-025
**Title:** Catalog Pending → Approved Flow
**Status:** done
**Feature:** FEATURE-017
**Milestone:** Validated & Shareable
**Departments:** [engineering, qa]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-024]

**Spec:** The system SHALL implement the QA review flow that promotes a pattern from `catalog/pending/` to `catalog/` on explicit approval, runs a regression check to ensure catch rate does not decrease.

**Scenarios:**
1. Given a pending pattern file / When `optinum catalog approve <filename>` runs / Then it validates the entry, moves it to `catalog/`, and adds it to `blind-spot-catalog.json`
2. Given a pattern is promoted / When regression check runs / Then it re-runs the fixture harness and benchmark; if catch rate decreases the promotion is rolled back
3. Given `optinum catalog test-fp <pattern-name>` / When run / Then it runs the pattern's test against `before/` code of relevant fixtures and fails if it fires on correct code
4. Given a community PR adds a pattern / When approval flow runs in CI / Then the same regression check gate applies

**Artifacts:**
- `src/cli/commands/catalog-approve.ts`
- `src/cli/commands/catalog-approve.test.ts`
- `catalog/`

**Produces:** Catalog approval CLI; regression-safe pattern promotion; false-positive check command

**Verify:** Approval moves file from pending → catalog; regression check blocks a catch-rate-decreasing pattern

---

## TASK-026
**Title:** Regression Suite CI Gate
**Status:** queued
**Feature:** FEATURE-018
**Milestone:** Validated & Shareable
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** ceo-gate
**Depends-on:** [TASK-016, TASK-023]

**Spec:** The system SHALL implement a GitHub Actions CI workflow for Optinum's own repo that runs the OSS benchmark on every PR, gates merges on quality thresholds, and posts the trust report as a PR comment.

**Scenarios:**
1. Given a PR to Optinum's repo / When regression suite CI runs / Then full pipeline runs against locked fixture set + benchmark and posts trust report comment
2. Given a prompt change drops catch rate to 72% / When CI runs / Then it blocks merge: "Catch rate regressed: 72% (threshold: 80%)"
3. Given a catalog change introduces a false positive pattern / When CI runs / Then false positive gate fires and blocks the PR
4. Given CI runs on Optinum's code / When trust report is posted / Then it includes "Optinum is validating its own pipeline — CI gate: PASS"

**Artifacts:**
- `.github/workflows/regression-suite.yml`
- `src/ci/regression-runner.ts`
- `src/ci/regression-runner.test.ts`

**Produces:** Regression CI for Optinum's repo; PR comment with catch rate; merge gate

**Verify:** Workflow YAML is valid; gate blocks a simulated regression; trust report PR comment renders

---

## TASK-027
**Title:** Developer README
**Status:** queued
**Feature:** FEATURE-019
**Milestone:** Validated & Shareable
**Departments:** [engineering]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-021, TASK-023]

**Spec:** The system SHALL provide a `README.md` under 300 lines covering: what Optinum does, quick start, how to read gap and trust reports, blind spot catalog reference table, and FAQ — with quick start verified to work exactly as written.

**Scenarios:**
1. Given a developer follows the quick start (`npm install -g optinum && optinum init && optinum test --diff <pr-url>`) / When commands run / Then they work exactly as documented with no additional steps
2. Given the FAQ section / When "Is this replacing my test suite?" is asked / Then the answer is clear: "No — Optinum generates diff-scoped integration tests as a CI step"
3. Given the blind spot catalog reference table / When a developer sees their change type / Then they understand what patterns Optinum probes and why
4. Given README exceeds 300 lines / When checked / Then it fails and must link to `docs/` for deep dives

**Artifacts:**
- `README.md`
- `docs/gap-report.md`
- `docs/trust-report.md`
- `docs/blind-spot-catalog.md`

**Produces:** Project README under 300 lines; supplemental docs for deep dives

**Verify:** Quick start commands work on clean install; README is <300 lines; all links resolve

---

## TASK-028
**Title:** Three-Loop Self-Validation — Inner Loop (per-PR CI)
**Status:** queued
**Feature:** FEATURE-020
**Milestone:** Validated & Shareable
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-009, TASK-026]

**Spec:** The system SHALL implement the inner self-validation loop: on every PR to Optinum's repo, run the Optinum pipeline (using the prior release's compiled artifact) against the PR diff and measure compilability, coverage, and catch rate; block merge on regression.

**Scenarios:**
1. Given a PR to Optinum / When the inner loop runs / Then it installs the latest published version (not the branch under development) and runs it against the PR diff
2. Given inner loop catch rate on fixture set drops below 80% / When CI runs / Then it fails: "Inner loop regression: catch rate dropped from X% to Y%"
3. Given a new fixture added to the set / When inner loop runs / Then it includes the new fixture without config changes
4. Given a documentation-only PR (no `.ts` files) / When inner loop runs / Then it skips synthesis and posts "No code changes — inner loop skipped"

**Artifacts:**
- `.github/workflows/inner-loop.yml`
- `src/ci/inner-loop.ts`
- `src/ci/inner-loop.test.ts`

**Produces:** Inner self-validation CI loop; per-PR catch rate check against locked fixtures

**Verify:** Inner loop runs on a test PR; uses prior release artifact; threshold blocks merge

---

## TASK-029
**Title:** Three-Loop Self-Validation — Middle Loop (StrykerJS adversarial)
**Status:** queued
**Feature:** FEATURE-020
**Milestone:** Validated & Shareable
**Departments:** [engineering, qa]
**Size:** large
**Gate:** ceo-gate
**Depends-on:** [TASK-028]

**Spec:** The system SHALL implement the weekly adversarial loop: StrykerJS generates surviving mutants from Optinum's source, TestSynthesizer iterates to kill them, mutation score delta tracked per pipeline version.

**Scenarios:**
1. Given StrykerJS runs on Optinum source and surviving mutants exist / When loop runs / Then each mutant is fed to TestSynthesizer as input and synthesizer attempts to generate a killing test
2. Given a mutant killed by a synthesized test / When run completes / Then it's added to the killed set and mutation score updated
3. Given mutation score drops below prior run / When weekly check completes / Then an alert is posted and score delta logged
4. Given a pipeline version change (new synthesis prompt) / When middle loop runs / Then it re-baselines the score for that version and logs before/after delta

**Artifacts:**
- `.github/workflows/middle-loop.yml` (weekly schedule)
- `src/ci/middle-loop.ts`
- `src/ci/middle-loop.test.ts`
- `stryker.config.json`

**Produces:** Mutation score tracking; adversarial improvement loop; weekly delta report

**Verify:** StrykerJS produces mutation report on Optinum source; surviving mutants passed to TestSynthesizer; scores tracked in `benchmark/mutation-scores.json`

---

## TASK-030
**Title:** Three-Loop Self-Validation — Outer Loop (metamorphic relations)
**Status:** queued
**Feature:** FEATURE-020
**Milestone:** Validated & Shareable
**Departments:** [engineering, qa]
**Size:** medium
**Gate:** no-gate
**Depends-on:** [TASK-008]

**Spec:** The system SHALL implement 5 metamorphic relation (MR) tests that verify Optinum's output consistency; run them before any catalog or synthesis prompt change is merged.

**Scenarios:**
1. Given MR-1: a no-op refactor (rename local variable) added to source / When pipeline runs on the no-op diff / Then `blindSpotsDetected` is identical to a run without the no-op
2. Given MR-2: renaming a variable in the changed function / When ChangeClassifier runs / Then `changeType` output is identical to pre-rename
3. Given MR-3: duplicating an unchanged function / When ASTParser runs / Then `DiffBlastRadius.dependents` does not expand
4. Given MR-4: adding a comment block to the changed function / When synthesis runs / Then `SynthesizedTest[]` is structurally equivalent to a run without the comment
5. Given MR-5: identical diffs applied to two repos with the same schema / When synthesis runs on both / Then output test structures are equivalent (same caseTypes and field names)

**Artifacts:**
- `src/ci/outer-loop.ts`
- `src/ci/outer-loop.test.ts`
- `src/ci/metamorphic-relations/`
- `.github/workflows/outer-loop.yml`

**Produces:** 5 MR tests; outer loop CI gate; MR violation detection

**Verify:** All 5 MR tests pass on current pipeline; MR-1 violation correctly detected when test mutation injected

---

## TASK-031
**Title:** Fixture Catalog Completeness Check
**Status:** done
**Feature:** FEATURE-021
**Milestone:** MVP: CLI Proof of Concept on TypeScript + Python
**Departments:** [engineering, qa]
**Size:** small
**Gate:** no-gate
**Depends-on:** [TASK-009]

**Spec:** The system SHALL verify all 15 fixture directories exist with required structure, each `expected-output.json` passes JSON schema validation, and all 5 FEATURE-005 required fixture classes are represented.

**Scenarios:**
1. Given all 15 fixture directories / When completeness check runs / Then every directory has `before/`, `after/`, `README.md`, `expected-output.json`
2. Given each `expected-output.json` / When validated against fixture output schema / Then all 15 pass without errors
3. Given the completeness check runs in fixture harness CI / When any fixture is malformed / Then it outputs which fixture failed and what field is missing
4. Given the 5 FEATURE-005 required classes / When verified against 15 fixtures / Then at least one fixture exists for each: `contract-change`, `auth-ownership`, `input-trust`, `idempotency`, `cascade-missing`

**Artifacts:**
- `src/fixtures/completeness-check.ts`
- `src/fixtures/completeness-check.test.ts`

**Produces:** Fixture catalog health check; CI gate before synthesis runs; 15-fixture coverage validation

**Verify:** Completeness check passes on current 15 fixtures; correctly fails when a fixture is missing `expected-output.json`
