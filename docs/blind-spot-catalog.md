# Blind Spot Catalog

AI coding agents have systematic, predictable failure patterns. They write happy paths thoroughly and miss integration boundary conditions — not randomly, but in ways shaped by their training distribution. The blind spot catalog encodes these patterns so Optinum can generate targeted tests for each one.

Catalog version: `0.3.0`. Patterns marked `confirmed` have real OSS evidence. Patterns marked `provisional` have no confirmed benchmark yet.

## Change Types

| Change Type | Trigger |
|---|---|
| `contract-change` | API schema fields added, removed, renamed, or status codes changed |
| `new-write-endpoint` | New route or mutation endpoint added |
| `cascade-change` | Delete/update with side effects, event emission, cache, error handling |
| `schema-migration` | ORM model changed (Prisma, SQLAlchemy, Drizzle) |
| `type-widening` | Return type changed to include `null` or `undefined` |
| `config-drift` | Service config or env key updated in one file, stale references elsewhere |

---

## Pattern Summary Table

| Pattern Name | Change Type | AI-Native? | AI Native Reason | Severity | Status | Evidence |
|---|---|---|---|---|---|---|
| Renamed API Parameters | contract-change | — | — | high | confirmed | [PR#35](https://github.com/emarco177/langchain-course/pull/35) |
| Changed Response Shape | contract-change | — | — | high | confirmed | [PR#1](https://github.com/Monichre/digital-mischief-group/pull/1) |
| New Required Field Not Sent | contract-change | — | — | critical | confirmed | [Issue#95](https://github.com/cyruzin/golang-tmdb/issues/95) |
| Removed Field Still Sent | contract-change | — | — | medium | provisional | — |
| HTTP Status Code Changed | contract-change | — | — | medium | provisional | — |
| Idempotency Key Not Sent | new-write-endpoint | — | — | critical | confirmed | [PR#6](https://github.com/adamrodi/groundwork/pull/6) |
| Auth Check Without Ownership | new-write-endpoint | — | — | critical | confirmed | [Issue#288](https://github.com/fagemx/edda/issues/288) |
| New Endpoint Outside Auth Middleware | new-write-endpoint | — | — | critical | confirmed | [Issue#349](https://github.com/OneStepAt4time/aegis/issues/349) |
| Sanitization Bypassed by Internal Callers | new-write-endpoint | — | — | high | provisional | — |
| Multi-Step Write Without Transaction | new-write-endpoint | — | — | critical | confirmed | [Issue#11](https://github.com/adssoccer1/finserv-monorepo/issues/11) |
| Delete Without Cascading | cascade-change | — | — | high | provisional | — |
| Event Emission Dropped | cascade-change | — | — | high | provisional | — |
| Cache Invalidation Lost | cascade-change | — | — | medium | provisional | — |
| Error Handler Swallows Exceptions | cascade-change | — | — | high | provisional | — |
| Async forEach Fire-and-Forget | cascade-change | Yes | Human devs know forEach is sync; LLMs learn async/await without learning the iterator contract | high | confirmed | [PR#304898](https://github.com/microsoft/vscode/pull/304898) |
| ORM Schema Without Migration | schema-migration | — | — | critical | confirmed | [Issue#24433](https://github.com/BerriAI/litellm/issues/24433) |
| Return Type Widened to Null | type-widening | — | — | high | provisional | — |
| Nested Property Without Null Guard | type-widening | Yes | LLMs trained on happy-path examples; null branches appear less in training data so guards are omitted | high | confirmed | [PR#1709](https://github.com/open-feature/java-sdk-contrib/pull/1709) |
| Error Cast Without Runtime Validation | contract-change | Yes | AI asserts the intended type from context; doesn't model divergence between declared and runtime shape | medium | confirmed | [PR#39428](https://github.com/RocketChat/Rocket.Chat/pull/39428) |
| Provider Config Missed Elsewhere | config-drift | Yes | AI edits the file in scope; doesn't grep for all references the way a human doing a swap would | high | confirmed | [PR#10](https://github.com/SamuelPalubaCZ/Picas/pull/10) |
| Mock Circular — Same Assumption | contract-change | Yes | AI generates code and test in same session with same context; mock reflects AI's assumption about dependency | high | provisional | — |
| AI Tests Miss Boundary Values | type-widening | Yes | Training data has far more success-path examples; AI reproduces the distribution it was trained on | high | provisional | — |
| Error Path Exists, No Test | cascade-change | Yes | AI writes error handling it has seen; doesn't write tests for it because test training data favours success paths | high | provisional | — |

---

## AI-Native Patterns Detail

These 7 patterns are flagged `aiNative: true` — they appear at systematically higher rates in AI-generated code than in human-authored code because they are artifacts of LLM training distribution, not random mistakes.

### `async-foreach-fire-forget` — Async forEach Fire-and-Forget
**Severity:** high | **AI Native**

AI writes `arr.forEach(async item => await fn(item))` not realising forEach ignores returned promises. Each async callback fires without being awaited — errors are silently swallowed and callers observe completion before work is done.

**Why AI gets this wrong:** Human developers know forEach is synchronous. LLMs learn the async/await pattern without learning the iterator contract — they see `async` + `await` together in examples and reproduce the pattern regardless of the collection method.

**OSS Evidence:** [microsoft/vscode#304898](https://github.com/microsoft/vscode/pull/304898) — forEach(async ...) causing fire-and-forget promises in notebook code; fixed by switching to Promise.all

---

### `config-drift-across-files` — Provider Config Updated in One File, Missed Elsewhere
**Severity:** high | **AI Native**

AI updates an LLM provider, API key reference, or service config in the file it is editing but leaves stale references in other files. The app boots with split config — one path uses the new provider, another still calls the old one.

**Why AI gets this wrong:** AI applies changes to the file in scope; it does not grep the codebase for all references the way a human doing a provider swap would.

**OSS Evidence:** [SamuelPalubaCZ/Picas#10](https://github.com/SamuelPalubaCZ/Picas/pull/10) — env var renamed in one file; next.config.js and other files still referenced old name; required follow-up PR to sweep remaining references

---

### `optional-chain-assumed-truthy` — Nested Property Access Without Null Guard
**Severity:** high | **AI Native**

AI accesses deeply nested properties (`obj.user.profile.avatar`) on values that can be null or undefined, without optional chaining or null guards.

**Why AI gets this wrong:** LLMs are trained on happy-path examples; null/undefined branches appear less frequently in training data so guards are systematically omitted.

**OSS Evidence:** [open-feature/java-sdk-contrib#1709](https://github.com/open-feature/java-sdk-contrib/pull/1709) — null pointer exception from missing descriptor check on optional value; fix added null guard before access

---

### `error-type-assertion-unchecked` — Error Response Cast to Type Without Runtime Validation
**Severity:** medium | **AI Native**

AI uses TypeScript `as` assertions to cast API error responses or exception objects to a typed shape without verifying the shape at runtime. When the actual error differs (e.g., string vs object), code accesses undefined fields silently.

**Why AI gets this wrong:** AI knows the intended type from context and asserts it confidently; it doesn't model the possibility that the runtime value diverges from the declared shape.

**OSS Evidence:** [RocketChat/Rocket.Chat#39428](https://github.com/RocketChat/Rocket.Chat/pull/39428) — Twilio SMS provider used `catch (e: any)` and accessed `e.message` directly; when a non-Error value was thrown, `e.message` was undefined causing agents to receive "undefined" notification; fix replaced as-cast with instanceof narrowing

---

### `mocked-dependency-circular-test` — Unit Test Mocks the Same Assumption the Code Has
**Severity:** high | **AI Native**

AI writes a unit test that mocks a dependency to return the exact shape the code was written to expect. Both code and mock share the same incorrect assumption. The test passes. The real caller sends a different shape and gets a runtime error.

**Why AI gets this wrong:** AI generates both code and test in the same session with the same context. The mock reflects what the AI assumed the dependency returns — if that assumption is wrong, the test is a circular proof of nothing.

---

### `boundary-values-untested` — AI Test Suite Has No Boundary or Edge Case Assertions
**Severity:** high | **AI Native**

AI generates a test suite with high line coverage but only tests happy-path inputs — the exact values used in examples. Empty arrays, zero, null, empty string, max integer, duplicate keys: none appear.

**Why AI gets this wrong:** Training data contains far more success-path examples than failure-path examples. AI reproduces the distribution it was trained on — tests cover what the training data showed being tested.

---

### `error-path-untested-by-ai` — Error Path Exists in Code but Has No Test
**Severity:** high | **AI Native**

AI writes a function with explicit error handling (try/catch, error return, 400/500 status branch) but writes no test for the error case. The error path is syntactically correct but functionally unverified.

**Why AI gets this wrong:** AI writes error handling because it has seen the pattern. It does not write the test for it because the training data for test generation overwhelmingly shows success path tests.

---

## Adding Patterns

The catalog is loaded from `src/catalog/blind-spot-catalog.json`. Each pattern requires: `id`, `name`, `changeType`, `description`, `testPattern`, `severity`. Set `provisional: false` only after OSS benchmark validation. See `src/catalog/catalog-schema.json` for the full schema.
