# Fixture 006 — Idempotency: Callers Not Updated After Required Field Added

## What This Proves
Optinum catches the failure where AI adds a required idempotency field to a payment schema but forgets to update callers. Both callers — a checkout button handler and a retry utility — continue sending the old payload shape. At runtime every payment attempt throws a ZodError. Duplicate charges remain possible via the retry path even after the fix is intended.

**Real-world origin:** A common AI coding pattern is adding idempotency enforcement to an existing endpoint in one pass, without scanning for all call sites. Unit tests on the endpoint pass (they use the new schema). Unit tests on callers pass (they mock fetch). The contract break is invisible until runtime.

## The Setup

A payment charge route gains a required `idempotencyKey` field. The route file is updated correctly. Two callers — `submitPayment` in checkout and `retryPayment` in utils — are not updated and still send only `{ amount, currency, customerId }`.

### Before (original code)

**`src/api/payments/charge/route.ts`** — schema without idempotencyKey
```typescript
const ChargeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  customerId: z.string(),
});
```

**`src/checkout/actions.ts`** — caller 1
```typescript
body: JSON.stringify({ amount, currency: "usd", customerId })
// no idempotencyKey — acceptable before the change
```

**`src/utils/retry.ts`** — caller 2
```typescript
body: JSON.stringify({ amount, currency: "usd", customerId })
// no idempotencyKey — acceptable before the change
```

---

### The AI Change (what goes in the PR diff)

**`src/api/payments/charge/route.ts`** — AI adds idempotencyKey as required field
```typescript
const ChargeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  customerId: z.string(),
  idempotencyKey: z.string().uuid(), // ← added — required, no .optional()
});
```

**What AI forgot:** `src/checkout/actions.ts` and `src/utils/retry.ts` still send payloads without `idempotencyKey`. `ChargeSchema.parse()` throws a ZodError on every real request. The retry path — the one most at risk of duplicate charges — is doubly broken: it can't even reach the idempotency check.

---

## What Optinum Must Do

### Step 1 — Blast radius (upward)
```
Changed: src/api/payments/charge/route.ts → POST handler, ChargeSchema

Upward (dependents): search all project files for fetch('/api/payments/charge')
→ src/checkout/actions.ts → submitPayment()
→ src/utils/retry.ts → retryPayment()
```

### Step 2 — Schema detection
```
Schema source: Zod (ChargeSchema in the changed file)
New contract: { amount, currency, customerId, idempotencyKey: uuid }
Old contract (from callers): { amount, currency, customerId }
Mismatch detected: idempotencyKey is required but callers omit it
```

### Step 3 — Tests generated

**Test A — new contract accepted:**
```typescript
it('POST /api/payments/charge accepts payload with idempotencyKey', async () => {
  const res = await fetch('/api/payments/charge', {
    method: 'POST',
    body: JSON.stringify({
      amount: 5000,
      currency: 'usd',
      customerId: 'cus_abc123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    }),
  });
  expect(res.status).toBe(200);
});
```

**Test C — caller contract verification:**
```typescript
it('submitPayment sends params matching current API contract', async () => {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
  global.fetch = mockFetch;

  await submitPayment(5000, 'cus_abc123');

  const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(sentBody).toHaveProperty('idempotencyKey'); // ← fails: not sent
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | New contract with idempotencyKey is valid |
| Test B | Pass | Duplicate idempotencyKey is idempotent |
| Test C | **Fail** | `submitPayment` missing idempotencyKey — **bug caught** |
| Test D | **Fail** | `retryPayment` missing idempotencyKey — **bug caught** |

Tests C and D failing on the PR is the proof. Neither caller was in the diff. Optinum found them via upward blast radius and generated contract verification tests that fail — before any deploy.

---

## How to Replicate

1. Create the file structure above in any TypeScript project
2. Apply only the AI change (update `route.ts`, leave callers unchanged)
3. Run: `optinum test --diff <this-pr-diff> --spec src/api/payments/charge/route.ts`
4. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "Required field idempotencyKey missing in 2 callers"

## Validation Criterion

Optinum passes this fixture if and only if:
- Upward blast radius identifies both `src/checkout/actions.ts` and `src/utils/retry.ts`
- Tests C and D are generated verifying callers send `idempotencyKey`
- Tests C and D fail when run against the unchanged caller code

If either test is missing or passes on the broken caller — Optinum missed the bug.
