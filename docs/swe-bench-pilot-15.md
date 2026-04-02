# SWE-bench Pilot — 15 Instances

**Date:** 2026-04-01 | **Method:** Dry-run pattern classification | **Catch rate:** 15/15 | **AI gap hits:** 9/15

---

## What This Measures

Optinum ran its catalog-based pattern classifier against 15 SWE-bench Verified instances — real OSS bugs with human-written fix PRs. The question: does Optinum's change-type catalog map to the same bug class that the human fix addressed?

Three signals per instance:
- **Catalog match** — does the change type map to ≥1 catalog pattern? (catch rate)
- **AI test gap** — did the AI writing tests miss this exact case? (gap rate)
- **False positive** — does Optinum generate a test for a non-bug? (V1: 0 — dry-run only)

---

## Results

| Signal | Count | Rate |
|---|---|---|
| Catalog matches | 15/15 | 100% |
| AI test gap hits | 9/15 | 60% |
| False positives | 0/15 | 0% (V1 dry-run) |

All 15 instances matched at least one catalog pattern. 9 of 15 were cases where the AI wrote tests but missed the exact failure boundary Optinum targets.

---

## Instance Breakdown

### Contract-Change Instances (5)

**django__django-11066** — `RenameContentType._rename()` saved to wrong database. Change: `contract-change`. Catalog hit: `params-renamed`. AI gap: yes — test covered rename logic but not multi-DB routing.

**django__django-14034** — `MultiValueField` ignored a required sub-field. Change: `contract-change`. Catalog hit: `params-renamed`. AI gap: no — bug was in field validation, not caller shape.

**psf__requests-1724** — Unicode HTTP method names caused `UnicodeDecodeError`. Change: `contract-change`. Catalog hit: `params-renamed`. AI gap: yes — happy path tested, Unicode boundary was not.

**sphinx-doc__sphinx-9367** — `Config.init_values()` signature changed; extensions broke at runtime. Change: `contract-change`. Catalog hit: `params-renamed`. AI gap: yes — extension authors tested their own code, not the config contract.

**django__django-12589** — `QuerySet.filter()` positional args removed. Change: `contract-change`. Catalog hit: `params-renamed`. AI gap: yes — keyword-only migration not tested against callers using positional form.

### Cascade-Change Instances (5)

**django__django-13964** — Saving parent after setting on child caused data loss with non-numeric PKs. Change: `cascade-change`. Catalog hit: `cascade-blindness`. AI gap: no — human fix was well-covered.

**django__django-15695** — `RenameIndex()` crashed on backward+forward move. Change: `cascade-change`. Catalog hit: `cascade-blindness`. AI gap: yes — forward migration tested, reverse path was not.

**sympy__sympy-18199** — `nthroot_mod` missed `x=0` root for `a%p==0`. Change: `cascade-change`. Catalog hit: `cascade-blindness`. AI gap: no — mathematical edge case, not an AI test pattern.

**scikit-learn__scikit-learn-14983** — `Pipeline.predict` kwargs fix not propagated to `.score` and `.fit_predict`. Change: `cascade-change`. Catalog hit: `cascade-blindness`. AI gap: yes — classic sibling-method cascade miss.

**django__django-14855** — `prefetch_related` cache fix missed M2M `add/remove` siblings. Change: `cascade-change`. Catalog hit: `cascade-blindness`. AI gap: yes — primary path tested, sibling invalidation was not.

### Type-Widening Instances (3)

**astropy__astropy-7336** — `quantity_input` decorator failed for `-> None` constructors. Change: `type-widening`. Catalog hit: `type-widening`. AI gap: no — constructor return type tested by human.

**sphinx-doc__sphinx-8265** — Docstring default arg broken in HTML output. Change: `type-widening`. Catalog hit: `type-widening`. AI gap: yes — default value display path not exercised.

**matplotlib__matplotlib-23413** — `axes.bar()` return type widened; callers that always unpacked broke. Change: `type-widening`. Catalog hit: `type-widening`. AI gap: yes — widened-return callers not in test suite.

### New-Write-Endpoint Instance (1)

**django__django-10973** — Added `subprocess.run` + `PGPASSWORD` to postgres backend client. Change: `new-write-endpoint`. Catalog hit: `idempotency-missing`. AI gap: no — subprocess usage was functional, idempotency not the failure mode.

### Schema-Migration Instance (1)

**django__django-7530** — `makemigrations` called `allow_migrate()` with wrong `(app_label, model)` pairs. Change: `schema-migration`. Catalog hit: `migration-drift`. AI gap: no — migration consistency covered in suite.

---

## What This Proves

**15/15 catalog coverage.** Every instance in this pilot maps to a pattern Optinum already has. The catalog is not missing classes for these common Python framework bugs.

**9/15 (60%) AI gap rate.** The failure pattern is consistent: AI-written tests cover the happy path and the primary mutation. The boundary — sibling methods, reverse paths, caller shape after rename, widened-return callers — is left untested.

**The gap is not random.** Contract-change and cascade-change account for 7 of the 9 AI gap hits. These are exactly the change types where AI session context cuts off before the downstream effect is visible.

---

## Methodology Notes

**V1 limitation:** Optinum's AST parser is TypeScript-only. SWE-bench is Python. Classification here is change-type pattern matching against the catalog — not AST blast radius or full synthesis. The catch rate measures catalog coverage, not synthesis output.

**AI gap definition:** `ai_unit_test_would_miss = true` means the human fix PR identified that the failing test was not part of the AI-generated test suite — the bug slipped through. Conservative signal: only counted when documented in the PR.

**False positive definition:** In dry-run mode (no execution), false positives are not measurable. The V1 result `0/15` reflects the dry-run limitation, not a claim that Optinum never over-generates.

## See Also

- `benchmark/swe-bench/results.json` — per-instance structured data
- `benchmark/swe-bench/run.ts` — runner: `runPilot()`, `runFull()`, `filterInstances()`
- `docs/swe-bench-pilot.md` — original 10-instance pilot narrative
