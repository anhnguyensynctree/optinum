# Research: Self-Validation Architecture for AI-Written Code

Date: 2026-03-26
Question: How to build a system that validates Optinum's own AI-written code using Optinum's own pipeline, without circular blind spots.

## Key Findings

### The Circularity Problem is Real
- Copilot study (arXiv:2310.02059): 29.5% Python, 24.2% JS snippets contain security weaknesses the same model cannot fix when prompted
- Same model → correlated blind spots. Not theoretical — documented at scale.
- One LLM cannot reliably test code it wrote. Mitigation requires external, model-agnostic signals.

### How Jest/Vitest/Pytest Test Themselves
All three use the same pattern: **test a compiled artifact via external process, never in-process recursion**
- Jest: `e2e/` directory with 80+ fixture projects, each runs a child Jest process
- Vitest: spawns fresh Vitest instance for every test except `core/` category
- Pytest: `pytester` fixture spawns isolated subprocess calls
- Key: the framework-under-test is always a separate process or pre-built binary
- **Optinum implication:** self-validation runs against a versioned Optinum release, not the branch being developed

### Mutation Testing is the Load-Bearing Signal
- StrykerJS (TS/JS), PIT (Java) inject small valid code changes — negated conditionals, swapped operators
- Mutation score = % of bugs caught. Strongest available proxy for test quality.
- **AdverTest (arXiv:2602.08146):** adversarial loop — test agent + mutant agent. Mutant agent finds surviving mutants; test agent iterates to kill them. Result: 63.3% improvement over EvoSuite on Defects4J.
- **MIST-RL (arXiv:2603.01409):** RL with mutation-based reward. +28.5% mutation score, 19.3% fewer test cases.
- Limitation: 10-30% of mutants may be "equivalent" (syntactically different, semantically identical). Use as relative improvement signal, not absolute truth.

### Breaking Circularity: 3-Layer Oracle Stack
No single technique is sufficient. Combine:
1. **Deterministic mutation testing** (StrykerJS) — model-agnostic, external
2. **Metamorphic relations** — assert output relationships, not ground-truth values. Adding semantically equivalent code should not change which blind spots fire. (arXiv:2512.22250 — outperforms LLM self-evaluation)
3. **Cross-model oracle** — if Claude wrote the code, GPT-4o evaluates the tests. Frontier models share training correlations but different reasoning paths.
4. **Documentation-based oracle** (AugmenTest, arXiv:2501.17461) — LLM infers expected behavior from docs/specs only, never from code. +30% assertion correctness vs 8.2% baseline.

### Test Smells — Invisible Failure Mode
LLMs systematically produce test smells that pass coverage and mutation metrics but are unmaintainable:
- **Assertion Roulette**: multiple assertions, no descriptive messages — can't tell which failed
- **Magic Number Test**: unexplained numeric literals in assertions
Source: arXiv:2410.10628 — 20,505 LLM-generated suites analyzed
Detection: TsDetect (TS/JS), JNose (Java)

### The Three-Loop Architecture (AdverTest + TDAD pattern)
```
Inner loop (execution):
  AI writes Optinum code → PR → Optinum pipeline runs on that PR
  Measures: compilability rate, coverage, catch rate on fixture set

Middle loop (adversarial):
  StrykerJS generates surviving mutants → TestSynthesizer refines to kill them
  Measures: mutation score delta per pipeline change
  Based on: AdverTest (arXiv:2602.08146)

Outer loop (metamorphic):
  Verify Optinum's outputs satisfy MRs across semantically equivalent code variants
  MR examples: no-op refactor shouldn't change blind spots fired
  Catches systematic bias invisible in single-run mutation testing
```

## Unknowns
- Equivalent mutant rate for TypeScript specifically (Java studies: 10-30%)
- Whether diff-scoped generation has different blind spots than whole-codebase generation (no paper found)
- Whether frontier model cross-validation truly provides independent failure modes (training data correlation risk)

## Recommended Architecture for Optinum (FEATURE-020)
See cleared-queue.md — Three-Loop Self-Validation Pipeline
