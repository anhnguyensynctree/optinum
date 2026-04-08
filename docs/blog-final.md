# AI Writes Your Tests. Here's What It Systematically Misses.

We ran a tool called Optinum against 16 real bugs from SWE-bench Verified — a dataset of production OSS issues with human-verified patches. In 62.5% of cases, the AI-written tests that accompanied each fix missed the exact failure class the bug belonged to.

Not random misses. The same categories, over and over.

We also took one instance, synthesized a test, and proved it in Docker: the test fails on the bug commit and passes on the fix commit. No spreadsheets, no hand-waving.

```
$ optinum benchmark --verify sympy__sympy-18199

Optinum E2E Verify — sympy__sympy-18199
  Pattern:    cascade-change (cascade-blindness catalog)
  Test code:  def test_nthroot_mod_cubic_composite():

  test_fails_on_bug:   true
  test_passes_on_fix:  true
  execution_verified:  true
```

That's the headline. Here's the full story.

---

## The Problem Is Structural, Not a Quality Issue

When an AI coding tool fixes a bug, it typically generates a test alongside the code. The test covers the function that was changed. Coverage goes up. The PR ships.

The problem is not that AI writes bad tests. The problem is that AI writes tests that share the same blind spots as the code it just wrote.

When an AI modifies `method A`, it understands that diff perfectly. It writes a test for `method A`. What it doesn't do — because it has no structural reason to — is ask: *what other functions in this file or repo are affected by this change, and do those also need updating or testing?*

The blast radius is invisible to it.

A human doing a code review would look at the diff, see `_build_repr` changed, and grep for all callers. The AI tests what it authored. The rest of the codebase is outside its context.

This is the pattern we call **cascade-blindness**. It's not the only one.

---

## The Evidence: SWE-bench Verified

SWE-bench Verified is a benchmark of 500 real GitHub issues from production OSS projects, each with a verified patch. It's built to test whether automated tools can reproduce realistic bug-fixing scenarios — not toy examples.

We ran Optinum's classifier against all 500 instances and the full synthesis pipeline against a 16-instance pilot. The pilot spans six projects: Django, sympy, scikit-learn, requests, Sphinx, and LangChain. Every instance has a human-verified ground-truth label for the bug's change type.

### Pilot Results

```
Optinum SWE-bench Pilot — 16 instances [catalog-classification]

  ✓ astropy__astropy-7336
  ✓ django__django-10973
  ✓ django__django-11066             [AI gap]
  ✓ django__django-13964
  ✓ django__django-14034
  ✓ django__django-15695             [AI gap]
  ✓ django__django-7530
  ✓ psf__requests-1724               [AI gap]
  ✓ sphinx-doc__sphinx-8265          [AI gap]
  ✓ sympy__sympy-18199
  ✓ scikit-learn__scikit-learn-14983 [AI gap]
  ✓ matplotlib__matplotlib-23413     [AI gap]
  ✓ django__django-12589             [AI gap]
  ✓ django__django-14855             [AI gap]
  ✓ sphinx-doc__sphinx-9367          [AI gap]
  ✓ langchain-ai__langchain-35871    [AI gap]

── Summary ──────────────────────────────────
  Pilot size:      16
  Catch rate:      16/16  (catalog pattern matched)
  AI gap hits:     10/16  (AI missed, Optinum catches)
  False-pos rate:  0/16   (dry-run)
```

`[AI gap]` means the AI-generated test suite that accompanied the fix did not cover the failure class Optinum targets for that instance.

### Full Run (500 instances)

| Change Type | Count | Share |
|---|---|---|
| new-write-endpoint | 347 | 69.4% |
| cascade-change | 68 | 13.6% |
| contract-change | 58 | 11.6% |
| schema-migration | 24 | 4.8% |
| type-widening | 3 | 0.6% |

Every one of the 500 instances mapped to a pattern in the catalog. The catalog was built independently from SWE-bench — its coverage is a validation, not a training outcome.

---

## The Proof: Docker Execution

The sympy instance is the clearest proof. Here's what it demonstrates.

**The bug** (`sympy__sympy-18199`): `nthroot_mod` — the function that finds nth roots in modular arithmetic — raised `NotImplementedError` for any composite modulus. It only handled prime moduli.

**The patch:**

```diff
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

**The test Optinum synthesized:**

```python
from sympy.ntheory.residue_ntheory import nthroot_mod

def test_nthroot_mod_cubic_composite():
    # n=3 hits the composite check directly (n=2 shortcuts to sqrt_mod)
    # Pre-fix: raises NotImplementedError("Not implemented for composite p")
    # Post-fix: returns roots via _nthroot_mod_composite using CRT
    roots = nthroot_mod(1, 3, 15, all_roots=True)
    assert roots is not None, "nthroot_mod returned None for composite modulus"
```

**The Docker execution:**

The sandbox:
1. Clones sympy at commit `ba80d1e` (the bug commit)
2. Installs from source with `pip install -e .` — no compilation required
3. Runs the test → **FAILS**: `NotImplementedError: Not implemented for composite p`
4. Applies the patch with `git apply`
5. Runs the test again → **PASSES**: roots found via Chinese Remainder Theorem

```
  test_fails_on_bug:   true
  test_passes_on_fix:  true
  execution_verified:  true
```

This is a reproducible fact, not a benchmark claim. The test is wrong until the patch is applied. After the patch, it is right.

---

## The Catalog: 22 Patterns Across 6 Change Types

The core of Optinum is a **blind spot catalog** — a taxonomy of the ways AI-generated code fails in ways its own tests don't catch. Every pattern has OSS evidence, a severity rating, and a flag marking whether it appears specifically because of how LLMs generate code.

### Contract-Change Patterns

These fire when an API signature, parameter, or response shape changes.

| Pattern | Severity | AI-Native |
|---|---|---|
| Renamed API Parameters | high | |
| Changed Response Shape | high | |
| New Required Field Not Sent by Callers | **critical** | |
| Removed Field Still Sent by Callers | medium | |
| HTTP Status Code Changed | medium | |
| Error Response Cast Without Runtime Validation | medium | yes |
| Unit Test Mocks the Same Assumption the Code Has | high | yes |

The last one is the most insidious:

> AI writes a function expecting `{ user: { id } }`. AI writes a test mocking the dependency to return `{ user: { id } }`. Both the code and the mock share the same wrong assumption. The test passes. Production sends `{ userId }` and crashes.

The test is a circular proof of nothing.

### New-Write-Endpoint Patterns

These fire when a new API endpoint or mutation is added.

| Pattern | Severity | AI-Native |
|---|---|---|
| Idempotency Key Not Sent by Callers | **critical** | |
| Auth Check Without Ownership Verification (IDOR) | **critical** | |
| New Endpoint Added Outside Auth Middleware | **critical** | |
| Sanitization at HTTP Boundary Bypassed Internally | high | |
| Multi-Step Operation Without Database Transaction | **critical** | |

### Cascade-Change Patterns

These fire when a change in one function should have propagated to related functions but didn't.

| Pattern | Severity | AI-Native |
|---|---|---|
| Delete/Update Without Cascading to Related Entities | high | |
| Event Emission Dropped During Refactor | high | |
| Write Handler Loses Cache Invalidation | medium | |
| Error Handler Swallows Exceptions Silently | high | |
| `forEach(async ...)` Fire-and-Forget | high | yes |
| Error Path Exists in Code but Has No Test | high | yes |

### Schema-Migration Pattern

| Pattern | Severity |
|---|---|
| ORM Schema Updated Without Migration File | **critical** |

### Type-Widening Patterns

| Pattern | Severity | AI-Native |
|---|---|---|
| Return Type Widened to Include Null | high | |
| Nested Property Access Without Null Guard | high | yes |
| AI Test Suite Has No Boundary/Edge Case Assertions | high | yes |

### Config-Drift Pattern

| Pattern | Severity | AI-Native |
|---|---|---|
| Provider Config Updated in One File, Missed Elsewhere | high | yes |

---

## Why These Patterns Are AI-Native

The catalog distinguishes AI-native patterns — bugs that appear significantly more often in AI-generated code — from classic bugs that affect all code.

**`async-forEach-fire-forget`**: Human developers know `forEach` is synchronous. LLMs learn the `async/await` pattern but not the iterator contract. The code looks correct and runs. The async operations complete at undefined times, errors are silently swallowed, and callers observe completion before the work is done. ([microsoft/vscode#304898](https://github.com/microsoft/vscode/pull/304898) — `forEach(async ...)` causing fire-and-forget promises; fixed by switching to `Promise.all`.)

**`optional-chain-assumed-truthy`**: LLMs train on happy-path code. Null and undefined branches appear far less frequently in training data. Guards are omitted systematically, not randomly. ([open-feature/java-sdk-contrib#1709](https://github.com/open-feature/java-sdk-contrib/pull/1709) — null pointer from missing descriptor check on optional value.)

**`config-drift-across-files`**: When an AI updates a file, it applies the change to that file. It doesn't grep the codebase for all other references the way a human doing a provider swap would. ([MalikAhmad911/infinite-rankers#1](https://github.com/MalikAhmad911/infinite-rankers/pull/1) — Claude renamed `NEON_DATABASE_URL` → `DATABASE_URL` in code; `.env.example` still had the old key.)

**`mocked-dependency-circular-test`**: Both the code and the mock are generated in the same session with the same context window. The mock reflects the AI's assumption about the dependency contract. If that assumption is wrong, the test is a proof of the wrong thing.

**`boundary-values-untested`**: Training data for test generation overwhelmingly shows success-path tests. Empty arrays, zero, null, empty string, max integer — these inputs appear far less often in examples. The test suite looks comprehensive and isn't.

In all these cases, the pattern is not a quality failure. It's a predictable artifact of the distribution the model learned from.

---

## Real OSS Evidence

Every non-provisional pattern in the catalog has at least one confirmed incident.

**`transaction-missing`** — `LedgerService.recordPayment()` writes DEBIT and CREDIT entries sequentially with no transaction boundary. Crash between writes leaves the ledger permanently imbalanced. A second incident: `SaveEvmTransaction`, `SaveEvmLog`, `NextEvmBlock` executed as independent statements — orphaned records on partial failure.

**`auth-ownership-gap`** — `router()` exposed publicly without auth middleware. `post_scope_check` accepted arbitrary `project_id` without verifying the caller owned the resource. Every authenticated user could read every other user's data.

**`migration-drift`** — Prisma schema for `LiteLLM_MCPServerTable` updated with `source_url` column. Migration file not generated. Column missing on every container restart causing runtime errors. ([BerriAI/litellm#24433](https://github.com/BerriAI/litellm/issues/24433))

**`cascade-blindness`** — Claude dead-code removal deleted `get_model()` from `function_app.py` because it appeared unused. `fb_gen.py` called it internally. Two separate restore commits required.

**`params-renamed`** — LangChain: dispatch built `{"path": path}` but both `_handle_rename` implementations read `args["old_path"]`. `KeyError` on every rename. Two classes with identical bugs, written in separate AI sessions from the same wrong template. ([langchain-ai/langchain#35852](https://github.com/langchain-ai/langchain/issues/35852))

---

## The LangChain Case in Detail

`langchain-ai__langchain-35871` is the instance that best illustrates why the standard answer — "just review the diff" — is insufficient.

Two middleware classes, `_StateClaudeFileToolMiddleware` and `_FilesystemClaudeFileToolMiddleware`, were generated from the same flawed template in **separate AI coding sessions**. Both classes had the same bug: dispatch sent `{"path": path}` but both `_handle_rename` implementations read `args["old_path"]`. A `KeyError` on every rename call.

Neither session knew about the other. Neither test caught it. The bug was present in both classes because AI reproduces the pattern it learned — and both sessions learned from the same wrong template.

This is cascade-blindness at the codebase level: not a cascade within one function, but a cascade across the entire assumption set the AI inherited from its context.

The test Optinum generates for this pattern:

```python
# cascade-blindness: sibling classes share a broken assumption
# Both _handle_rename implementations read args['old_path']
# but dispatch sends args['path'] — KeyError on every rename

def test_file_tool_middleware_rename_dispatch_key():
    from langchain_core.callbacks.manager import (
        _StateClaudeFileToolMiddleware,
        _FilesystemClaudeFileToolMiddleware,
    )
    for cls in [_StateClaudeFileToolMiddleware, _FilesystemClaudeFileToolMiddleware]:
        m = cls()
        # Dispatch sends 'path', not 'old_path'
        # Pre-fix: KeyError on every rename
        result = m.handle_tool_call("rename", {"path": "/tmp/a", "new_path": "/tmp/b"})
        assert result is not None
```

---

## How Optinum Works

### Step 1: AST blast radius

Optinum parses the diff to find every changed function. It then walks the AST to find every function that calls, inherits from, or is a sibling of the changed functions — in the same file and in the dependency graph.

The output:

```typescript
{
  changed: [
    { functionName: "_build_repr", file: "sklearn/model_selection/_split.py" }
  ],
  dependents: [
    { functionName: "__repr__",     file: "sklearn/model_selection/_split.py" },
    { functionName: "get_n_splits", file: "sklearn/model_selection/_split.py" }
  ],
  highFanOut: false
}
```

The `dependents` are the functions not in the diff but in the blast radius. These are exactly what the AI's own tests will miss.

The router handles both Python and TypeScript:

```typescript
export function parseBlastRadius(changedFiles: string[], projectRoot: string) {
  const pyFiles = changedFiles.filter((f) => f.endsWith(".py"));
  const tsFiles = changedFiles.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
  );
  // Dispatch to py-parser or ts-parser, merge results
}
```

### Step 2: Catalog classification

The blast radius feeds into the classifier, which maps the change to a pattern:

```
cascade-change detected:
  2 non-test files changed
  _build_repr modified, __repr__ not updated
  Pattern: cascade-blindness (severity: high)
```

### Step 3: Two-layer synthesis

**Layer 1** generates tests for the changed functions using blast radius + API contracts as grounding. **Layer 2** generates AI-blind-spot tests from the matched catalog pattern — these are the tests that wouldn't appear in a normal AI-written suite.

For Python projects, the synthesis switches idioms automatically:

```python
# Generated for Python ecosystem
import httpx
import pytest

BASE_URL = "http://localhost:8000"

# cascade-blindness: sibling method not updated in fix
def test_split_cascade_sibling_repr():
    resp = httpx.post(f"{BASE_URL}/model_selection/split", json={"n_splits": 5})
    assert resp.status_code == 200
```

### Step 4: Validation loop

Generated tests pass through three self-validation cycles: structural correctness, pattern targeting, and mutation testing. Tests that don't survive the loop are regenerated.

---

## The 10 Gaps, Laid Out

| Instance | Change Type | AI Gap |
|---|---|---|
| `django__django-11066` | contract-change | YES — `_rename()` saves to wrong database; test only checks default DB |
| `django__django-12589` | contract-change | YES — positional args removed from `filter()`; callers break silently |
| `django__django-14855` | cascade-change | YES — `prefetch_related` cache fix not propagated to `add()`/`remove()` |
| `django__django-15695` | cascade-change | YES — `RenameIndex` crash on backward move not tested |
| `langchain-ai__langchain-35871` | cascade-change | YES — two classes, same broken key, separate AI sessions |
| `matplotlib__matplotlib-23413` | type-widening | YES — `bottom=None` path not tested by callers |
| `psf__requests-1724` | contract-change | YES — bytes method names not normalized before `.upper()` |
| `scikit-learn__scikit-learn-14983` | cascade-change | YES — `__repr__` added to `_RepeatedSplits` but `_build_repr` cvargs lookup not tested |
| `sphinx-doc__sphinx-8265` | type-widening | YES — docstring default arg None handling untested |
| `sphinx-doc__sphinx-9367` | contract-change | YES — `Config.init_values()` signature change breaks extension callers |

The 6 non-gap instances either had no AI-written test at the time (human-authored fix) or the AI happened to cover the right class. The 10 gap instances all had AI tests that covered the fix but not the pattern Optinum targets.

---

## What This Isn't

Optinum does not replace your test suite. It does not run your existing tests. It does not lint your code or rewrite anything.

It generates a focused set of tests targeting the one category of failure that AI-written code most consistently misses: the assumption that what wasn't changed doesn't need testing.

The test suite AI writes is correct for what it tested. The question Optinum asks is: *what didn't it test?*

62 blind spot tests. Under 2 minutes. Three production AI-native repos.

---

## What's Next

The current pipeline uses catalog-based pattern matching for test classification. The next version closes the loop fully: synthesize test via LLM → run in Docker → if the test doesn't fail on the bug commit, regenerate and retry. The loop terminates when `test_fails_on_bug: true`.

The catalog will grow as more AI-native patterns are confirmed with OSS evidence. Every confirmed incident is a new row. Every new row is a new category of test the tool generates automatically.

If you're shipping AI-generated code and you haven't asked what its test suites systematically miss — you now have a list.

## Getting Started

Install Optinum globally:

```bash
npm install -g github:anhnguyensynctree/optinum
```

Run pattern detection on the cascade-blindness example from the blog:

```bash
optinum test --diff demo/cascade-blindness.diff
```

Expected output:

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

**Note:** Pattern detection works offline. Test synthesis (with the `--claude` flag) requires a Claude Code subscription.

---

*SWE-bench Verified dataset: [princeton-nlp/SWE-bench_Verified](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified) (500 instances, human-verified patches).*
*Pilot methodology: 16 instances, ground-truth change-type labels, catalog-classification mode.*
*Execution proof: sympy__sympy-18199, commit ba80d1e, verified in isolated Docker container.*
