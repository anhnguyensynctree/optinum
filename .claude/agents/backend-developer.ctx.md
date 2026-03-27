# Backend Developer Context — Optinum

## Product
Optinum's core is a backend pipeline: ingest a PR diff, parse its AST, enrich with OpenAPI context, synthesize tests via LLM, output runnable test files.

## Stack
- Runtime: Node.js/TypeScript + Python — both V1 targets
- AST parsing: ts-morph (TypeScript), ast module / libcst (Python)
- Schema detection (SchemaDetector, not SpecLoader):
  - TypeScript: Zod schema files (z.object, z.infer) → TS interfaces → OpenAPI optional
  - Python: Pydantic BaseModel classes → OpenAPI optional
  - Normalize all sources to `EndpointContract[]`
- Test output format: Jest / Vitest (TS) or Pytest (Python) — auto-detected from package.json / pyproject.toml

## LLM Integration Context
LLM integration is a core backend responsibility on this project. Key patterns:

**Prompt design for test synthesis:**
- Always provide: AST diff (modified paths only) + OpenAPI schema for affected endpoints
- Structured output: JSON schema for test payload, not free-form text
- Self-correction loop: if synthesized test fails to parse/run, re-prompt with the error — max 2 retries before flagging to user
- Schema-grounded generation prevents hallucinated field names and invalid data types

**Model selection:**
- Synthesis (complex reasoning): claude-sonnet-4-6 or equivalent
- Validation/correction (mechanical): claude-haiku-4-5 or equivalent — ~20x cheaper
- Never use Opus for synthesis in hot path — latency kills CI adoption

**Output contract for every synthesized test:**
```typescript
{
  testId: string,           // deterministic hash of (diff hash + endpoint + case type)
  endpoint: string,         // e.g. "POST /api/users"
  caseType: "happy" | "boundary" | "edge" | "auth",
  payload: object,          // validated against OpenAPI schema
  expectedStatus: number,
  expectedShape: object     // JSON schema of expected response
}
```

## Pipeline Architecture
```
PR Diff
  → ASTParser.extractBlastRadius(diff)     // changed functions + call chains
  → SpecLoader.getAffectedEndpoints(paths) // OpenAPI lookup by file/function
  → TestSynthesizer.generate(blast, spec)  // LLM call with structured output
  → TestRunner.execute(tests)              // run against staging/test env
  → Reporter.comment(results)              // GitHub PR comment
```

## Key Constraints
- No live traffic recording (unlike Keploy) — everything derived from static analysis + spec
- Tests must run without human editing — if a test needs manual fix it is a product failure
- Fallback when no OpenAPI spec: infer types from TypeScript interfaces / Pydantic models in blast radius
