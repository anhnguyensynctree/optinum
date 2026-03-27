# Fixture 011 — Transaction Missing: Non-Atomic Multi-Write Loses Funds

## What This Proves

Optinum catches cases where AI refactors a single atomic operation into multiple sequential DB calls without wrapping them in a transaction. Each call succeeds or fails independently — if the second throws after the first commits, the system ends up in a corrupt partial state. For financial operations, this means money disappears.

**Real-world origin:** AI extracted wallet debit and ledger credit into separate service functions during a refactor. Both functions were tested individually and passed. No transaction was added. A network timeout on the ledger insert left wallets debited with no matching ledger record — balances were negative but no payment evidence existed.

## The Setup

`transferFunds()` previously performed one atomic operation. AI splits it into `debitWallet()` and `creditLedger()` — two separate sequential DB calls — without a `db.transaction()` wrapper. A pre-existing `chargeSubscription()` caller in billing assumes the old atomicity guarantee.

### Before

- `src/services/wallet.ts`: `transferFunds()` as a single atomic stub

### The AI Change

- `src/services/wallet.ts`: calls `debitWallet()` then `creditLedger()` — no transaction
- `src/services/debit.ts`: NEW — extracted debit operation
- `src/services/ledger.ts`: NEW — extracted credit/ledger insert
- `src/api/payments/transfer/route.ts`: NEW — API endpoint calling `transferFunds`
- **Not updated:** `src/billing/subscription.ts` — calls `transferFunds` assuming it is still atomic

### What AI Forgot

No database transaction wraps the two calls. If `creditLedger()` throws (network timeout, constraint violation, deadlock), `debitWallet()` has already committed. The wallet balance is reduced but no ledger entry records where the money went. Callers like `chargeSubscription()` that relied on the atomicity guarantee of the original function are now silently broken.

---

## What Optinum Must Do

### Step 1 — Detect non-atomic multi-write

```
Changed: src/services/wallet.ts
Pattern: sequential await calls to two separate DB-write functions
No transaction wrapper (db.transaction / prisma.$transaction / BEGIN...COMMIT)
→ Transaction-missing detected
```

### Step 2 — Blast radius

```
Changed: wallet.ts, debit.ts, ledger.ts, route.ts
Upward dependents: src/billing/subscription.ts → calls transferFunds() → now non-atomic
```

### Step 3 — Tests generated

**Test A — happy path:**
```typescript
it('POST /api/payments/transfer succeeds when both operations succeed', async () => {
  const res = await fetch('/api/payments/transfer', {
    method: 'POST',
    body: JSON.stringify({
      fromId: '123e4567-e89b-12d3-a456-426614174000',
      toId: '223e4567-e89b-12d3-a456-426614174001',
      amount: 50,
    }),
  });
  expect(res.status).toBe(200);
});
```

**Test C — partial failure (catches the bug):**
```typescript
it('debit commits even when creditLedger throws', async () => {
  vi.mocked(creditLedger).mockRejectedValueOnce(new Error('DB timeout'));
  await expect(transferFunds('from-id', 'to-id', 50)).rejects.toThrow();
  // ← debitWallet already committed — funds lost without ledger record
  expect(debitWallet).toHaveBeenCalledTimes(1); // debit ran
  expect(creditLedger).toHaveBeenCalledTimes(1); // credit attempted and threw
  // No rollback — state is corrupt
});
```

**Test D — chargeSubscription caller:**
```typescript
it('chargeSubscription handles partial failure atomically', async () => {
  vi.mocked(creditLedger).mockRejectedValueOnce(new Error('Constraint violation'));
  await expect(chargeSubscription('user-id', 100)).rejects.toThrow();
  // ← FAILS: debit committed, ledger not written — corrupt state, no rollback
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | Happy path is valid |
| Test B | Pass | Zero-amount validation works |
| Test C | **Fail** | Partial failure leaves debit without credit |
| Test D | **Fail** | `chargeSubscription` atomicity assumption broken |

---

## How to Replicate

1. Apply the AI change: split `transferFunds` into two sequential calls, no transaction
2. Run: `optinum test --diff <this-pr-diff> --spec src/services/wallet.ts`
3. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "Non-atomic multi-write detected — transaction required"

## Validation Criterion

Optinum passes this fixture if and only if:
- It detects two sequential DB-write calls in `transferFunds` without a transaction wrapper
- Test C is generated simulating `creditLedger` failure after `debitWallet` success
- `src/billing/subscription.ts` is identified as an upward dependent
- Test D is generated for `chargeSubscription` and fails
