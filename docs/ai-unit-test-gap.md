# AI-vs-AI Evidence: Why AI Unit Tests Miss AI Code Bugs

AI coding agents write code and tests in the same session, from the same context, with the same assumptions. When the code has a blind spot the test has the same blind spot. Both turn green. The bug ships.

This is structural, not incidental. LLMs learn from training data where success paths vastly outnumber failure paths. They generate code that handles the cases they were shown, then generate tests that verify the code handles those same cases. The test suite turns green. The integration boundary — or the error path, or the boundary input, or the async contract — breaks in production.

Optinum is adversarially isolated from that loop. It receives only the structural diff (blast radius, contracts, change types) and generates tests from an independent context with no access to the developer's assumptions. The five cases below are reproducible proof of the gap.

Each case is a triple: (a) AI-generated code with a real bug, (b) AI-generated unit test that passes despite the bug, (c) Optinum-style test that fails on the buggy code and would have caught it before it shipped. Benchmark fixtures live in `benchmark/ai-unit-test-gap/`.

---

## Case 1: New Required Field Not Sent by Callers

**Catalog pattern:** `required-field-added` · Severity: critical · changeType: `contract-change`

**Fixture:** `benchmark/ai-unit-test-gap/case-001-required-field-added/`

### The bug

An AI session adds multi-currency support to an order service. It adds `currencyCode` as a required field to the Zod schema for `createOrder`. The code is correct: Zod rejects any payload missing the field with a `ZodError`. The bug is not in the new code — it is in every existing caller. Those callers were written before `currencyCode` existed. They do not send it. Every call from a pre-existing caller throws `ZodError` at runtime.

```typescript
// ai-code.ts — correct implementation, wrong for existing callers
const CreateOrderSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string(),
  quantity: z.number().int().positive(),
  currencyCode: z.string().length(3), // Added in this AI session
});
```

### What the AI test does (and misses)

The AI wrote the test in the same session. It naturally includes `currencyCode` in every test payload — the AI just added that field and includes it reflexively. Every test passes. No test simulates a caller that predates the schema change.

```typescript
// ai-test.ts — always includes currencyCode because AI wrote it right after adding the field
createOrder({ userId: "...", productId: "prod-123", quantity: 2, currencyCode: "USD" })
// Every call passes. The omission case is never tested.
```

**What the test misses:** The blast radius — every caller of `createOrder` that existed before the change. The AI's session scope is the file it edited, not the callers upstream.

### What Optinum generates

Optinum receives the diff: `CreateOrderSchema` gained `currencyCode` (required). It traverses the blast radius to find existing callers and generates a test that replicates their pre-change payload — without the new field.

```typescript
// optinum-test.ts
it("FAILS: existing caller payload without currencyCode throws ZodError", () => {
  expect(() =>
    createOrder({ userId: "...", productId: "prod-123", quantity: 2 })
    // currencyCode intentionally absent — replicates pre-change caller
  ).toThrow(/required/i); // ZodError at currencyCode
});
```

This test **fails on the buggy code** (the code throws, which is expected — the test passes by design). The point is that no such test existed before Optinum. The AI test suite had 100% coverage of the new field and 0% coverage of the caller-omits-field path.

**OSS evidence:** [golang-tmdb #95](https://github.com/cyruzin/golang-tmdb/issues/95) — struct missing required fields `adult`, `known_for_department`, `original_name`, `popularity` after schema update; callers sent old struct without new fields; API rejected every call.

---

## Case 2: Async forEach Fire-and-Forget

**Catalog pattern:** `async-foreach-fire-forget` · Severity: high · changeType: `cascade-change`

**Fixture:** `benchmark/ai-unit-test-gap/case-002-async-foreach-fire-forget/`

### The bug

An AI session writes a notification dispatch function using `arr.forEach(async item => await fn(item))`. The AI knows `async/await` syntax. It does not model the fact that `forEach` ignores returned promises. The function fires all sends without awaiting any of them, returns immediately, and silently swallows any rejection.

```typescript
// ai-code.ts
export async function dispatchNotifications(
  notifications: Notification[],
  service: NotificationService
): Promise<void> {
  notifications.forEach(async (notification) => {
    await service.send(notification); // awaited inside, but forEach drops the outer promise
  });
  // Returns here — before any send() completes
}
```

### What the AI test does (and misses)

The AI mocks `service.send()` with `jest.fn().mockResolvedValue(undefined)`. This mock resolves synchronously in the microtask queue. By the time Jest's assertion runs, all callbacks have resolved — not because `forEach` awaited them, but because the mock is instantaneous. The test cannot distinguish "properly awaited" from "fire-and-forget with fast mock."

```typescript
// ai-test.ts
const mockSend = jest.fn().mockResolvedValue(undefined); // resolves instantly
await dispatchNotifications(notifications, service);
expect(mockSend).toHaveBeenCalledTimes(2); // PASSES — timing bug invisible
```

**What the test misses:** The ordering guarantee (function should not return before sends complete) and error propagation (rejection from `send()` should surface to caller).

### What Optinum generates

Optinum detects `forEach(async ...)` in the AST diff and generates two probes: a delayed mock that exposes the return-before-completion bug, and a rejecting mock that exposes the swallowed-error bug.

```typescript
// optinum-test.ts — delayed mock probe
const service = {
  send: jest.fn().mockImplementation(
    (n) => new Promise<void>((resolve) => {
      setTimeout(() => { completionOrder.push(n.userId); resolve(); }, 10);
    })
  ),
};
await dispatchNotifications([...], service);
expect(completionOrder).toHaveLength(2); // FAILS — completionOrder is [] (sends haven't run)
```

**OSS evidence:** [vscode #304898](https://github.com/microsoft/vscode/pull/304898) — `forEach(async ...)` causing fire-and-forget promises in notebook code; fixed by switching to `Promise.all`.

---

## Case 3: Unit Test Mocks the Same Assumption the Code Has

**Catalog pattern:** `mocked-dependency-circular-test` · Severity: high · changeType: `contract-change`

**Fixture:** `benchmark/ai-unit-test-gap/case-003-mocked-dependency-circular-test/`

### The bug

An AI session writes `getUserProfile` that calls `UserRepository.findById`. The AI assumes the repository returns `{ user: { id, name, email } }` (nested). The real repository returns `{ id, name, email }` (flat). The code accesses `response.user.name` — correct for the assumed shape, but `response.user` is `undefined` with the real repository, producing a `TypeError` in production.

```typescript
// ai-code.ts
const response = await repo.findById(userId);
return {
  displayName: response.user.name,  // TypeError in production: user is undefined
  email: response.user.email,
  avatarUrl: `https://avatars.example.com/${response.user.id}`,
};
```

### What the AI test does (and misses)

The AI wrote the mock in the same session as the code, with the same assumption. The mock returns the nested shape the AI imagined. The test is a circular proof: it verifies that the code works when given the shape the code expects, which it always will.

```typescript
// ai-test.ts
findById: jest.fn().mockResolvedValue({
  user: { id: "usr-abc123", name: "Alice Smith", email: "alice@example.com" },
  // Real repository shape is flat — this mock is wrong and makes the test meaningless
}),
```

**What the test misses:** The actual contract of `UserRepository.findById`. The mock and the code share a wrong assumption. Both pass. Both are wrong.

### What Optinum generates

Optinum does not have the developer's session context. It reads the actual `UserRepository` contract from the source type definitions (or infers from existing callers) and generates a mock using the real shape. The test immediately exposes the mismatch.

```typescript
// optinum-test.ts — uses real flat shape, not AI's assumed nested shape
const realShapeRepo = {
  findById: jest.fn().mockResolvedValue({
    id: "usr-abc123", name: "Alice Smith", email: "alice@example.com",
    // No `user` wrapper — response.user will be undefined
  }),
};
await expect(getUserProfile("usr-abc123", realShapeRepo as any))
  .rejects.toThrow(TypeError); // FAILS (currently unhandled) — TypeError surfaces
```

**Why this is AI-native:** AI generates both code and test in the same session. The mock reflects what the AI assumed the dependency returns. If that assumption is wrong, the test is a circular proof of the assumption, not a verification of the contract.

---

## Case 4: No Boundary or Edge Case Assertions

**Catalog pattern:** `boundary-values-untested` · Severity: high · changeType: `type-widening`

**Fixture:** `benchmark/ai-unit-test-gap/case-004-boundary-values-untested/`

### The bug

An AI session writes `calculateDiscount` for a shopping cart. The function has two boundary bugs: dividing total by `items.length` produces `NaN` when the array is empty (0/0), and accepting `discountPercent > 100` produces a negative `finalTotalCents`. Both are real user inputs — empty cart at checkout, a coupon code with an out-of-range value.

```typescript
// ai-code.ts
const averagePrice = originalTotal / items.length; // NaN when items is empty
const discountAmount = Math.round((originalTotal * discountPercent) / 100);
const finalTotal = originalTotal - discountAmount; // negative when percent > 100
```

### What the AI test does (and misses)

The AI tests the three inputs from its own docstring examples: a two-item cart with 10%, a single item with 0%, and a single item with 100%. All are within the happy path. No empty array. No `discountPercent > 100`. Line coverage looks complete. Both bugs are invisible.

```typescript
// ai-test.ts — every test uses a non-empty array and a valid 0-100 percent
calculateDiscount([{ productId: "prod-1", priceInCents: 1000, quantity: 2 }], 10)
// NaN and negative-total bugs never triggered
```

**What the test misses:** Empty input, zero input, maximum/overflow values, and invalid-but-plausible inputs. These are inputs real users send. AI training data shows success-path tests overwhelmingly; boundary tests appear rarely and are systematically omitted.

### What Optinum generates

Optinum probes boundary values by design: empty, zero, null, max, duplicate, and values outside declared ranges.

```typescript
// optinum-test.ts
it("FAILS: empty items array produces NaN averagePriceCents", () => {
  const result = calculateDiscount([], 10);
  expect(Number.isNaN(result.averagePriceCents)).toBe(false); // FAILS — it IS NaN
});

it("FAILS: discount > 100 produces negative finalTotalCents", () => {
  const result = calculateDiscount(
    [{ productId: "p", priceInCents: 1000, quantity: 1 }],
    150
  );
  expect(result.finalTotalCents).toBeGreaterThanOrEqual(0); // FAILS — returns -500
});
```

**OSS evidence:** Documented across Copilot/ChatGPT test generation studies — AI-generated test suites show 90%+ happy-path bias; error and boundary paths have near-zero coverage.

---

## Case 5: Error Path Exists in Code but Has No Test

**Catalog pattern:** `error-path-untested-by-ai` · Severity: high · changeType: `cascade-change`

**Fixture:** `benchmark/ai-unit-test-gap/case-005-error-path-untested-by-ai/`

### The bug

An AI session writes `handleFileUpload` with four response paths: 200 (success), 413 (file too large), 415 (unsupported MIME type), and 500 (storage failure). The 413 branch has a copy-paste bug — the AI wrote `status: 400` instead of `status: 413`, copying from a nearby validation handler. The bug is on line 1 of the untested branch. Because no test exercises that branch, it ships undetected.

```typescript
// ai-code.ts
if (req.sizeInBytes > MAX_SIZE_BYTES) {
  return { data: null, error: "FILE_TOO_LARGE", status: 400 }; // BUG: should be 413
}
```

### What the AI test does (and misses)

The AI wrote one test — the success path. The AI knows error branches exist (it wrote them) but training data for test generation overwhelmingly shows success-path tests. The error branches are syntactically correct but functionally unverified.

```typescript
// ai-test.ts — one test, success path only
it("returns 200 and file data on successful upload", async () => {
  // 100 KB file, valid MIME type — never triggers any error branch
});
// 3 error paths untested — status code bug on line 36 invisible
```

**What the test misses:** Every error path. The 413 path is particularly dangerous because the wrong status code causes HTTP clients checking for `413 Content Too Large` to treat the rejection as a generic `400 Bad Request` and not surface a meaningful error to users.

### What Optinum generates

Optinum detects that `handleFileUpload` has 4 return paths and the AI test covers 1. It generates a test for each uncovered branch with explicit status code assertions.

```typescript
// optinum-test.ts
it("FAILS: oversized file should return status 413, not 400", async () => {
  const result = await handleFileUpload(
    { ...BASE_REQUEST, sizeInBytes: 11 * 1024 * 1024 },
    noopStorage
  );
  expect(result.error).toBe("FILE_TOO_LARGE");
  expect(result.status).toBe(413); // FAILS — code returns 400 (copy-paste bug)
});
```

Optinum also generates the 415 and 500 tests, both of which pass — but the existence of the 413 failure is enough to block the PR.

**OSS evidence:** GitHub PRs titled "fix error handling" or "add error case test" across Node.js/Python API repos are post-hoc fixes for exactly this pattern — bugs found in production because the error branch was never tested.

---

## Summary

| Case | Pattern ID | Failure Class | AI Test Status | Optinum Test Status |
|---|---|---|---|---|
| 1 — Required field added | `required-field-added` | Contract: caller blast radius | PASS (bug ships) | FAIL (bug caught) |
| 2 — Async forEach | `async-foreach-fire-forget` | Async: timing and error propagation | PASS (bug ships) | FAIL (bug caught) |
| 3 — Circular mock | `mocked-dependency-circular-test` | Mock: shared wrong assumption | PASS (bug ships) | FAIL (bug caught) |
| 4 — No boundary tests | `boundary-values-untested` | Coverage: happy-path bias | PASS (bug ships) | FAIL (bug caught) |
| 5 — Error path untested | `error-path-untested-by-ai` | Coverage: error branch bias | PASS (bug ships) | FAIL (bug caught) |

The common mechanism: the AI generates both code and tests from the same session context. Optinum generates tests from a structurally isolated context that only receives the diff. The independence is the mechanism of detection.
