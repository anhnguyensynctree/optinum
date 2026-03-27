# Fixture 009 — Cache Invalidation: Stale Data Served After Profile Update

## What This Proves
Optinum catches the failure where AI rewrites a PUT handler and drops the cache invalidation call. The endpoint returns 200 with the correct updated profile. But the GET endpoint for the same resource reads from cache first — and since the cache is never cleared, it serves the pre-update data indefinitely. No error is raised. Users see stale profiles after every update.

**Real-world origin:** Cache invalidation is a side effect, not a business rule — AI frequently omits it when rewriting handlers because it isn't in the "happy path" of the function. The import disappears, the `cache.delete` call disappears, and the rewrite looks cleaner. The GET endpoint is unrelated in the diff and invisible to reviewers.

## The Setup

A profile PUT route invalidates `user:{id}` from cache before returning. The AI rewrite drops both the import and the `cache.delete` call. A sibling GET route at `src/api/users/[id]/route.ts` reads from cache first and will now serve stale data indefinitely after any PUT.

### Before (original code)

**`src/api/users/[id]/profile/route.ts`** — PUT with cache invalidation
```typescript
import { cache } from "@/lib/cache";

export async function PUT(req, { params }) {
  const updates = await req.json();
  const profile = { id: params.id, ...updates, updatedAt: new Date().toISOString() };
  await cache.delete(`user:${params.id}`); // ← clears stale GET cache
  return Response.json({ profile });
}
```

**`src/api/users/[id]/route.ts`** — GET reads from cache
```typescript
export async function GET(req, { params }) {
  const cached = await cache.get(`user:${params.id}`);
  if (cached) return Response.json({ profile: cached }); // ← served stale after PUT fails to clear
  // ...
}
```

---

### The AI Change (what goes in the PR diff)

**`src/api/users/[id]/profile/route.ts`** — AI rewrites, drops cache invalidation
```typescript
// import { cache } removed
export async function PUT(req, { params }) {
  const updates = await req.json();
  const profile = { id: params.id, ...updates, updatedAt: new Date().toISOString() };
  // cache.delete(`user:${params.id}`) silently removed
  return Response.json({ profile });
}
```

**What AI forgot:** The GET route at `src/api/users/[id]/route.ts` caches profiles under `user:{id}`. Without the `cache.delete` call in PUT, every GET after a PUT returns the pre-update profile. A user who changes their name from "Alice" to "Bob" will continue to see "Alice" in every read.

---

## What Optinum Must Do

### Step 1 — Contract delta detection
```
Before: PUT called cache.delete(`user:${params.id}`)
After: cache.delete call removed, cache import removed
Contract delta: removed — cache.delete(user:id)
```

### Step 2 — Blast radius (cache readers)
```
Changed: src/api/users/[id]/profile/route.ts → PUT handler

Downward (dependencies): src/lib/cache.ts → cache (now absent from changed file)
Upward (cache readers for same key): search for cache.get(`user:${params.id}`)
→ src/api/users/[id]/route.ts → GET handler — reads user:{id} from cache
```

### Step 3 — Tests generated

**Test C — stale cache verification:**
```typescript
it('GET returns fresh profile after PUT update', async () => {
  // Prime cache by calling GET
  await fetch('/api/users/user-1');

  // Update profile
  await fetch('/api/users/user-1/profile', {
    method: 'PUT',
    body: JSON.stringify({ name: 'Bob' }),
  });

  // Cache should be invalidated — fresh data expected
  const res = await fetch('/api/users/user-1');
  const { profile } = await res.json();
  expect(profile.name).toBe('Bob'); // ← fails: returns 'Alice' from stale cache
});
```

**Test D — missing call assertion:**
```typescript
it('PUT handler calls cache.delete to invalidate stale cache', async () => {
  const spy = vi.spyOn(cache, 'delete');

  await fetch('/api/users/user-1/profile', {
    method: 'PUT',
    body: JSON.stringify({ name: 'Bob' }),
  });

  expect(spy).toHaveBeenCalledWith('user:user-1'); // ← fails: cache.delete not called
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | PUT returns 200 with updated profile |
| Test B | Pass | PUT with empty body returns 400 |
| Test C | **Fail** | GET returns stale profile after PUT — **cache bug caught** |
| Test D | **Fail** | `cache.delete` not called in PUT handler — **invalidation removal caught** |

Tests C and D failing on the PR is the proof. The GET route was not in the diff. Optinum found it by tracing the cache key contract that was removed, generated tests that sequence PUT then GET, and the tests fail.

---

## How to Replicate

1. Create the file structure above in any TypeScript project
2. Apply only the AI change (update `profile/route.ts`, leave all other files unchanged)
3. Run: `optinum test --diff <this-pr-diff> --spec src/api/users/[id]/profile/route.ts`
4. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "Cache invalidation removed — GET at src/api/users/[id]/route.ts will serve stale data"

## Validation Criterion

Optinum passes this fixture if and only if:
- Contract delta detects `cache.delete(user:id)` was removed
- Blast radius identifies `src/api/users/[id]/route.ts` as a cache reader for the same key
- Tests C and D are generated and fail against the broken handler

If `cache.delete` removal is not detected or the GET route is not found — Optinum missed the bug.
