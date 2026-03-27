# Fixture 012 — Type Widening: Nullable Return Breaks Callers

## What This Proves

Optinum catches the null-safety gap created when AI widens a function's return type from `T` to `T | null`. Callers that were written against the non-null contract continue to access fields directly — TypeScript compiles fine if the caller file is not updated, but runtime throws `TypeError: Cannot read properties of null`.

**Real-world origin:** AI refactored an auth helper to return `null` instead of throwing on an invalid token — a reasonable UX improvement. It updated the function signature but not the two callers. Both callers accessed `.email` and `.name` directly. On any unauthenticated request, both crashed with an unhandled TypeError.

## The Setup

`getCurrentUser()` changes from `Promise<User>` (throws on bad token) to `Promise<User | null>` (returns null on bad token). Two callers — a profile API route and a request logger — are not updated. Both access `.name` or `.email` directly on the result without a null check.

### Before

- `src/services/auth.ts`: `getCurrentUser(): Promise<User>` — throws `new Error("No token")` if token is empty
- `src/api/profile/route.ts`: accesses `user.name` and `user.email` safely (user never null)
- `src/middleware/log.ts`: accesses `user.email` safely (user never null)

### The AI Change

- `src/services/auth.ts`: return type widened to `Promise<User | null>`, empty token returns `null` instead of throwing
- **Not updated:** `src/api/profile/route.ts` — still accesses `user.name` without null check
- **Not updated:** `src/middleware/log.ts` — still accesses `user.email` without null check

### What AI Forgot

Both callers were written against a non-null contract. The TypeScript compiler would catch this — but only if the callers are re-checked. If the compiler is run only against the changed file (or not run at all), both callers pass type-checking on their own because `user` is typed as `User` from their perspective (no import re-resolution). At runtime, any request with no `Authorization` header hits `user.name` on `null` and crashes with an unhandled TypeError.

---

## What Optinum Must Do

### Step 1 — Detect return type widening

```
Changed: src/services/auth.ts
Before: getCurrentUser(): Promise<User>
After:  getCurrentUser(): Promise<User | null>
→ Return type widened — null introduced
```

### Step 2 — Blast radius (upward)

```
Upward dependents of getCurrentUser:
→ src/api/profile/route.ts  → accesses user.name, user.email — no null guard
→ src/middleware/log.ts     → accesses user.email — no null guard
```

### Step 3 — Tests generated

**Test A — happy path:**
```typescript
it('GET /api/profile with valid token returns user data', async () => {
  const req = new Request('http://localhost/api/profile', {
    headers: { Authorization: 'Bearer valid-token' },
  });
  const res = await GET(req);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('name');
  expect(body).toHaveProperty('email');
});
```

**Test C — null dereference in profile route (catches the bug):**
```typescript
it('GET /api/profile with no token does not crash with TypeError', async () => {
  const req = new Request('http://localhost/api/profile', {
    headers: { Authorization: '' },
  });
  // ← FAILS: user is null, user.name throws TypeError
  const res = await GET(req);
  expect(res.status).toBe(401); // should return 401, not crash
});
```

**Test D — null dereference in log middleware:**
```typescript
it('logRequest with no token does not crash with TypeError', async () => {
  const req = new Request('http://localhost/some-path', {
    headers: { Authorization: '' },
  });
  // ← FAILS: user is null, user.email throws TypeError
  await expect(logRequest(req, '/some-path')).resolves.not.toThrow();
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | Valid token path works correctly |
| Test B | Pass | Empty token edge case defined |
| Test C | **Fail** | `user.name` on null — TypeError in profile route |
| Test D | **Fail** | `user.email` on null — TypeError in log middleware |

---

## How to Replicate

1. Apply the AI change: widen `getCurrentUser` return type, leave callers unchanged
2. Run: `optinum test --diff <this-pr-diff> --spec src/services/auth.ts`
3. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "Return type widened to nullable — 2 callers access fields without null guard"

## Validation Criterion

Optinum passes this fixture if and only if:
- It detects the return type change from `Promise<User>` to `Promise<User | null>`
- Both `src/api/profile/route.ts` and `src/middleware/log.ts` are identified as upward dependents
- Test C is generated exercising the null path in the profile route and fails
- Test D is generated exercising the null path in the log middleware and fails
