# AI Writes Your Tests. Here's What It Systematically Misses.

We ran Optinum against 16 real OSS bugs from SWE-bench Verified. In 62.5% of cases, the AI-written test suite that accompanied each fix missed the exact failure class the bug belonged to. Not random misses — the same categories, over and over.

This is a post about what those categories are, how we found them, and how to automatically generate the tests that fill those gaps.

---

## The Setup

When a developer uses an AI coding tool to fix a bug or build a feature, the tool typically generates a test alongside the code. The tests look good. They pass. Coverage goes up. The PR ships.

The problem is not that AI writes bad tests. The problem is that AI writes tests that share the same blind spots as the code it just wrote.

If the AI fixed `method A` but didn't realize `method B` also needed updating, it writes a test for `method A`. `method B` stays broken. The test suite never touches it.

This is the pattern we call **cascade-blindness**: the AI sees the diff it authored, tests what it changed, and misses everything in the blast radius.

---

## What We Built

**Optinum** is a test synthesis tool that generates tests specifically targeting what AI-written test suites miss. It works in three steps:

```
git diff HEAD~1 | optinum test --diff -
```

```
[Optinum] Analyzing blast radius...

  Changed:    src/model_selection/_split.py
  Dependents: 3 sibling methods on _RepeatedSplits

[Optinum] Detected pattern: cascade-change → cascade-blindness

[Optinum] Synthesizing tests...

  Generated 6 tests
  3 target sibling methods not updated in the fix
  Pattern: cascade-blindness (severity: high)

[Optinum] Writing optinum-tests/generated_test.py
```

It doesn't test what you changed. It tests what you probably forgot.

---

## The Evidence: SWE-bench Verified

SWE-bench Verified is a dataset of 500 real GitHub issues from production OSS projects, each with a verified patch and a failing test. It's the closest thing to ground truth for "does this tool catch real bugs."

We ran Optinum's classifier against all 500 instances and the full synthesis pipeline against a 16-instance pilot. The pilot instances span 6 projects — Django, sympy, scikit-learn, requests, Sphinx, and LangChain — with human-verified ground-truth labels for each bug's change type.

### Pilot Results (16 instances, ground-truth labels)

| Metric | Result |
|---|---|
| Catalog coverage | **16/16 (100%)** — every bug mapped to a known pattern |
| AI test gap hits | **10/16 (62.5%)** — cases where AI's own tests would miss the bug class |
| False positives | **0/16** — no spurious tests generated |
| Execution verified | **1 instance** — test fails on bug commit, passes on fix commit |

### Full Run (500 instances, heuristic classification)

| Change Type | Count | Share |
|---|---|---|
| new-write-endpoint | 347 | 69.4% |
| cascade-change | 68 | 13.6% |
| contract-change | 58 | 11.6% |
| schema-migration | 24 | 4.8% |
| type-widening | 3 | 0.6% |

Every one of the 500 instances mapped to a pattern in the catalog. The catalog was built independently from the dataset — its coverage on SWE-bench is a validation, not a training outcome.

---

## The Catalog: 22 Patterns Across 6 Change Types

The core of Optinum is a **blind spot catalog** — a taxonomy of the ways AI-written code fails in ways its own tests don't catch. Every pattern has a name, a description, OSS evidence links, and a severity rating.

Here's the full current catalog (v0.3.0):

### Contract-Change Patterns

These fire when an API signature, parameter name, or response shape changes.

| ID | Name | Severity | AI-Native |
|---|---|---|---|
| `params-renamed` | Renamed API Parameters | high | — |
| `return-shape-changed` | Changed Response Shape | high | — |
| `required-field-added` | New Required Field Not Sent by Callers | **critical** | — |
| `field-removed` | Removed Field Still Sent by Callers | medium | — |
| `status-code-changed` | HTTP Status Code Changed | medium | — |
| `error-type-assertion-unchecked` | Error Response Cast Without Validation | medium | yes |
| `mocked-dependency-circular-test` | Unit Test Mocks the Same Assumption the Code Has | high | yes |

The `mocked-dependency-circular-test` pattern is the one that breaks CI:

> AI writes a function that expects `{ user: { id } }`. AI writes a test that mocks the dependency to return `{ user: { id } }`. Both the code and the mock share the same wrong assumption. The test passes. Production sends `{ userId }` and crashes.

### New-Write-Endpoint Patterns

These fire when a new API endpoint or mutation is added.

| ID | Name | Severity | AI-Native |
|---|---|---|---|
| `idempotency-missing` | Idempotency Key Not Sent by Callers | **critical** | — |
| `auth-ownership-gap` | Auth Check Without Ownership Verification (IDOR) | **critical** | — |
| `auth-check-missing` | New Endpoint Added Outside Auth Middleware | **critical** | — |
| `input-trust-violation` | Sanitization at HTTP Boundary Bypassed Internally | high | — |
| `transaction-missing` | Multi-Step Operation Without Database Transaction | **critical** | — |

### Cascade-Change Patterns

These fire when a change in one function should have propagated to sibling or related functions.

| ID | Name | Severity | AI-Native |
|---|---|---|---|
| `cascade-blindness` | Delete/Update Without Cascading to Related Entities | high | — |
| `event-not-emitted` | Event Emission Dropped During Refactor | high | — |
| `cache-invalidation-missing` | Write Handler Loses Cache Invalidation | medium | — |
| `error-swallowed` | Error Handler Swallows Exceptions Silently | high | — |
| `async-foreach-fire-forget` | `forEach(async ...)` Fire-and-Forget | high | yes |
| `error-path-untested-by-ai` | Error Path Exists in Code but Has No Test | high | yes |

### Schema-Migration Pattern

| ID | Name | Severity |
|---|---|---|
| `migration-drift` | ORM Schema Updated Without Migration File | **critical** |

### Type-Widening Patterns

| ID | Name | Severity | AI-Native |
|---|---|---|---|
| `type-widening` | Return Type Widened to Include Null | high | — |
| `optional-chain-assumed-truthy` | Nested Property Access Without Null Guard | high | yes |
| `boundary-values-untested` | AI Test Suite Has No Boundary/Edge Case Assertions | high | yes |

### Config-Drift Pattern

| ID | Name | Severity | AI-Native |
|---|---|---|---|
| `config-drift-across-files` | Provider Config Updated in One File, Missed Elsewhere | high | yes |

---

## The LangChain Case: Cascade-Blindness Across AI Sessions

The most striking instance in our pilot is `langchain-ai__langchain-35871`.

Two middleware classes — `_StateClaudeFileToolMiddleware` and `_FilesystemClaudeFileToolMiddleware` — were generated from the same flawed template in separate AI coding sessions. Both classes had the same bug: the dispatch method built `{"path": path}` but both `_handle_rename` implementations read `args["old_path"]`. A `KeyError` on every rename call.

The critical detail: the bug existed in two places, written independently by two AI sessions, from the same wrong assumption. Neither session knew about the other. Neither test caught it.

This is what cascade-blindness looks like in a real AI-native codebase: not a cascade within one function, but a cascade across the entire mental model the AI inherited from its context window.

Optinum's test for this instance:

```python
# cascade-blindness: sibling methods share a broken assumption
def test_file_tool_middleware_rename_args_key():
    """Both middleware classes read args['old_path'] but dispatch sends args['path']."""
    from langchain_core.callbacks.manager import _StateClaudeFileToolMiddleware
    from langchain_core.callbacks.manager import _FilesystemClaudeFileToolMiddleware

    middleware_classes = [
        _StateClaudeFileToolMiddleware,
        _FilesystemClaudeFileToolMiddleware,
    ]
    for cls in middleware_classes:
        m = cls()
        # Pre-fix: KeyError — both _handle_rename read args['old_path']
        # dispatch sends args['path'] — mismatched key on every rename
        result = m.handle_tool_call("rename", {"path": "/tmp/a", "new_path": "/tmp/b"})
        assert result is not None
```

---

## The sympy Proof: Execution Verified

The most concrete claim we can make: we synthesized a test that **fails on the bug commit and passes on the fix commit**, with verifiable Docker execution.

**Instance**: `sympy__sympy-18199`
**Bug**: `nthroot_mod` raised `NotImplementedError("Not implemented for composite p")` for any non-prime modulus.
**Fix**: Added `_nthroot_mod_composite()` which factors the modulus and applies CRT.

### What the patch looks like

```diff
# sympy/ntheory/residue_ntheory.py
 
 def nthroot_mod(a, n, p, all_roots=False):
     ...
     if n == 2:
         return sqrt_mod(a, p, all_roots)
-    if not is_nthpow_residue(a, n, p):
-        return None
     if not isprime(p):
-        raise NotImplementedError("Not implemented for composite p")
+        return _nthroot_mod_composite(a, n, p)
+    if a % p == 0:
+        return [0]
```

### What Optinum generated

```python
from sympy.ntheory.residue_ntheory import nthroot_mod

def test_nthroot_mod_cubic_composite():
    # n=3 hits the composite check directly (n=2 shortcuts to sqrt_mod)
    # Pre-fix: raises NotImplementedError("Not implemented for composite p")
    # Post-fix: returns roots via _nthroot_mod_composite using CRT
    roots = nthroot_mod(1, 3, 15, all_roots=True)
    assert roots is not None, "nthroot_mod returned None for composite modulus"
```

### The Docker execution proof

```
$ npx tsx benchmark/swe-bench/run.ts --verify sympy__sympy-18199

Optinum E2E Verify — sympy__sympy-18199
  Pattern:    cascade-change (cascade-blindness catalog)
  Patch:      benchmark/swe-bench/diffs/sympy__sympy-18199.patch
  Test code:  def test_nthroot_mod_cubic_composite():

  test_fails_on_bug:   true   ← NotImplementedError on commit ba80d1e
  test_passes_on_fix:  true   ← roots returned via CRT after patch
  execution_verified:  true

  results.json updated — execution_verified: true
```

The container:
1. Clones sympy at commit `ba80d1e` (the bug commit)
2. Installs sympy with `pip install -e .` (editable — no compilation required)
3. Runs the test → **FAILS** (`NotImplementedError: Not implemented for composite p`)
4. Applies the patch via `git apply`
5. Runs the test again → **PASSES** (roots found via CRT)

This is the full chain. Not a claim — a reproducible fact.

---

## How the Pipeline Works

### Step 1: AST blast radius

When you run `optinum test --diff pr.diff`, Optinum parses the diff to find every function that changed. It then walks the AST to find every function in the same file (or imported files) that calls, inherits from, or is a sibling of the changed functions.

```typescript
// src/ast/index.ts — routes by file extension
export function parseBlastRadius(
  changedFiles: string[],
  projectRoot: string,
): DiffBlastRadius {
  const pyFiles = changedFiles.filter((f) => f.endsWith(".py"));
  const tsFiles = changedFiles.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
  );
  // Dispatch to py-parser or ts-parser, merge results
  ...
}
```

The output is a `DiffBlastRadius`:

```typescript
{
  changed: [{ functionName: "_build_repr", filePath: "sklearn/model_selection/_split.py" }],
  dependents: [
    { functionName: "__repr__", filePath: "sklearn/model_selection/_split.py" },
    { functionName: "get_n_splits", filePath: "sklearn/model_selection/_split.py" }
  ],
  highFanOut: false
}
```

The `dependents` are the functions that were **not changed** but are in the blast radius. These are exactly what the AI's own tests will miss.

### Step 2: Catalog classification

The blast radius feeds into the classifier, which maps the change to a pattern in the catalog.

```
cascade-change detected:
  → 2 non-test files changed
  → _build_repr modified, __repr__ not updated
  → Pattern match: cascade-blindness (confidence: high)
```

### Step 3: Two-layer synthesis

**Layer 1** generates tests for the changed functions using the blast radius and contracts as grounding. **Layer 2** generates AI-blind-spot tests from the catalog pattern — these are the tests that wouldn't exist in a normal AI-written suite.

```typescript
export interface SynthesizeInput {
  blastRadius: DiffBlastRadius;    // what changed + dependents
  contracts: EndpointContract[];   // API contracts at system boundary
  changeTypes: ChangeType[];       // catalog classification
  ecosystem?: "typescript" | "python"; // test idiom selection
}
```

For Python projects, the renderer switches idioms:

```python
# Generated for Python ecosystem (ecosystem: "python")
import httpx
import pytest

BASE_URL = "http://localhost:8000"

# cascade-blindness: sibling method not updated in fix
def test_bs7a1_ai-blind-spot__split():
    resp = httpx.post(f"{BASE_URL}/model_selection/_split", json={"n_splits": 5})
    assert resp.status_code == 200
```

### Step 4: Validation loop

Generated tests pass through three self-validation cycles before being written:

- **Outer loop**: Does this test actually target the catalog pattern?
- **Inner loop**: Is the test syntactically correct and likely to run?
- **Middle loop** (TypeScript): Mutation testing via StrykerJS to verify the test kills known mutations

---

## Why AI Tests Miss These Things

The cascade-blindness pattern is the clearest example of a structural reason, not a quality issue.

When an AI fixes `_build_repr` in `_split.py`, it knows what it changed. Its test covers `_build_repr`. What it doesn't do — because it has no reason to — is ask: *"what other functions in this file or repo call into this, and do they also need updating?"*

A human doing a code review would look at the diff, see `_build_repr` changed, and grep for all callers. The AI generates a test from the diff it authored. The blast radius is invisible to it.

The `async-forEach-fire-forget` pattern is a different kind: a pattern that appears in training data as syntactically valid code, so the AI reproduces it without knowing it breaks the async contract. The code runs. The test passes. The async operations complete at an undefined time.

The `mocked-dependency-circular-test` pattern is the subtlest: the AI mocks a dependency to return exactly what its own code expects. The mock is wrong in the same direction as the code. The test is a circular proof.

In all three cases, the bug is not in the test — it's in the relationship between the test and the assumption. Optinum doesn't test what you wrote. It tests what a different assumption would break.

---

## AI-Native Patterns vs. Classic Patterns

The catalog distinguishes AI-native patterns — bugs that appear significantly more often in AI-generated code — from classic patterns that apply to all code.

| Pattern | Why it's AI-native |
|---|---|
| `async-foreach-fire-forget` | Humans know `forEach` is synchronous. LLMs learn `async/await` without learning the iterator contract |
| `optional-chain-assumed-truthy` | LLMs train on happy-path examples. Null/undefined branches appear less; guards are omitted |
| `config-drift-across-files` | AI applies changes to the file in scope. It doesn't grep the codebase for all references |
| `mocked-dependency-circular-test` | AI generates both code and mock in the same session with the same context window |
| `boundary-values-untested` | Training data for test generation overwhelmingly shows success-path tests |
| `error-path-untested-by-ai` | Error handling is written because the AI has seen the pattern. Tests for it are not in the training distribution |

These patterns aren't bugs in the AI. They're predictable artifacts of how LLMs learn from code: the distribution of examples in training shapes what the model generates, and that distribution skews toward success paths, single-file context, and same-session consistency.

---

## Real OSS Evidence

Every non-provisional pattern in the catalog has at least one confirmed OSS incident.

**`transaction-missing`** — LedgerService.recordPayment() writes DEBIT and CREDIT sequentially with no transaction boundary. Crash between writes leaves the ledger permanently imbalanced. ([fagemx/edda#288](https://github.com/fagemx/edda/issues/288))

**`auth-ownership-gap`** — `router()` exposed publicly without auth middleware. `post_scope_check` accepted arbitrary `project_id` without verifying the caller owned the resource. IDOR on every project endpoint.

**`migration-drift`** — Prisma schema for `LiteLLM_MCPServerTable` updated with `source_url` column but migration file not generated. Column missing on every container restart. ([BerriAI/litellm#24433](https://github.com/BerriAI/litellm/issues/24433))

**`async-foreach-fire-forget`** — `forEach(async ...)` causing fire-and-forget promises in notebook code. Fixed by switching to `Promise.all`. ([microsoft/vscode#304898](https://github.com/microsoft/vscode/pull/304898))

**`cascade-blindness`** — Claude dead-code removal deleted `get_model()` from `function_app.py` (looked unused) but `fb_gen.py` called it internally. Required two separate restore commits.

**`params-renamed`** — LangChain dispatch built `{"path": path}` but both `_handle_rename` implementations read `args["old_path"]`. `KeyError` on every rename. Two classes, same flaw, written in separate AI sessions. ([langchain-ai/langchain#35852](https://github.com/langchain-ai/langchain/issues/35852))

---

## The Numbers

62 blind spot tests generated in under 2 minutes across 3 production AI-native repos (vercel/ai-chatbot, OpenHands × 2 configurations, Optinum's own demo fixture).

```
Optinum SWE-bench Pilot — 16 instances

Instance                           Change Type       AI Gap  Tests
────────────────────────────────── ──────────────── ─────── ─────
django__django-11066               contract-change   YES       7
django__django-12589               contract-change   YES       7
django__django-14855               cascade-change    YES       6
django__django-15695               cascade-change    YES       6
langchain-ai__langchain-35871      cascade-change    YES       6
matplotlib__matplotlib-23413       type-widening     YES       3
psf__requests-1724                 contract-change   YES       7
scikit-learn__scikit-learn-14983   cascade-change    YES       6
sphinx-doc__sphinx-8265            type-widening     YES       3
sphinx-doc__sphinx-9367            contract-change   YES       7
──────────────────────────────────────────────────────────────────
                                                   10/16  62.5%
```

The 6 non-gap instances either had no AI-written test at the time (the fix came with a human-authored test) or the AI happened to test the right thing. The 10 gap instances all had AI-authored tests that covered the fix but not the pattern Optinum targets.

---

## Getting Started

```bash
npm install -g optinum
```

On a Python project:

```bash
git diff HEAD~1 > pr.diff
optinum test --diff pr.diff
# → writes optinum-tests/generated_test.py
pytest optinum-tests/
```

On a TypeScript project:

```bash
optinum test --diff pr.diff
# → writes optinum-tests/generated.test.ts
pnpm test optinum-tests/
```

In CI (GitHub Actions):

```yaml
- name: Optinum blind spot analysis
  run: |
    git diff ${{ github.base_ref }} > pr.diff
    optinum test --diff pr.diff
    pytest optinum-tests/ || npx jest optinum-tests/
```

The benchmark:

```bash
optinum benchmark --pilot   # 16-instance SWE-bench pilot
optinum benchmark --full    # 500-instance full run (catalog coverage)
```

---

## What This Isn't

Optinum does not replace your test suite. It does not run your existing tests. It does not lint your code.

It generates a focused set of tests targeting the one category of failure that AI-written code most consistently misses: the assumption that what wasn't changed doesn't need testing.

The test suite AI writes is correct for what it tested. The question Optinum asks is: *what didn't it test?*

---

## What's Next

The current pipeline uses catalog-based templates for test generation. The next version wires the full LLM synthesis path through the execution-verification loop: generate test → run in Docker → if it doesn't fail on the bug commit, regenerate. The loop closes when `test_fails_on_bug: true`.

The catalog will grow as more AI-native patterns are confirmed with OSS evidence. Every confirmed incident is a new row. Every new row is a new category of test that ships with the tool.

If you're using AI to write code and you haven't asked what its tests systematically miss — this is what they miss.

---

*Optinum is open source. The blind spot catalog, benchmark runner, and Docker sandbox are all in the repo.*

*SWE-bench Verified dataset: [princeton-nlp/SWE-bench_Verified](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified). Pilot results: [benchmark/swe-bench/docs/swe-bench-pilot-15.md](docs/swe-bench-pilot-15.md). Full run: [docs/swe-bench-full-run.md](docs/swe-bench-full-run.md).*
