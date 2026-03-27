# Fixture 007 — Cascade Missing: Delete Endpoint Leaves Orphaned Records

## What This Proves
Optinum catches the failure where AI adds a delete endpoint but omits the cascade calls that clean up child records. The cascade functions (`deleteUserPosts`, `deleteUserComments`) already exist in the codebase — they just aren't imported or called. No upward caller is broken; the gap is purely downward: the new handler should call these functions and doesn't.

**Real-world origin:** AI commonly writes delete handlers that remove the primary record without considering foreign key constraints or related data. The function signatures for cleanup already exist in service files — the AI just never connects them. The endpoint returns 200 while the database is left inconsistent.

## The Setup

A user delete route is added with `deletedAt` tracking. The route file is the only changed file. Two service functions — `deleteUserPosts` and `deleteUserComments` — exist in adjacent service files and are the correct hooks for cascade cleanup. Neither is imported or called in the new handler.

### Before (original code)

**`src/api/users/[id]/route.ts`** — minimal stub, no cascade concern
```typescript
export async function DELETE(req, { params }) {
  return Response.json({ deleted: true, userId: params.id });
}
```

**`src/services/posts.ts`** and **`src/services/comments.ts`** — cleanup functions exist but no delete route references them yet.

---

### The AI Change (what goes in the PR diff)

**`src/api/users/[id]/route.ts`** — AI adds deletedAt timestamp, does not add cascade
```typescript
export async function DELETE(req, { params }) {
  const result = { deleted: true, userId, deletedAt: new Date().toISOString() };
  // deleteUserPosts() and deleteUserComments() never called
  return Response.json(result);
}
```

**What AI forgot:** Posts and comments referencing `userId` are now orphaned. If the database enforces FK constraints, the delete itself may fail. If it doesn't, `getPostsByUser(userId)` returns records for a deleted user indefinitely.

---

## What Optinum Must Do

### Step 1 — Blast radius (downward)
```
Changed: src/api/users/[id]/route.ts → DELETE handler added

Downward (dependencies): search for functions that should be called during user deletion
→ src/services/posts.ts → deleteUserPosts(userId) — exists, not called
→ src/services/comments.ts → deleteUserComments(userId) — exists, not called
```

This is a **downward** gap — not a broken caller, but a missing call to an existing dependency.

### Step 2 — Gap detection
```
New operation: DELETE /api/users/:id
Cascade candidates: functions named deleteUser* or *ByUser in services/
Found: deleteUserPosts, deleteUserComments — neither imported in changed file
Gap: cascade functions exist but handler does not call them
```

### Step 3 — Tests generated

**Test C — orphaned records check:**
```typescript
it('posts are deleted when user is deleted', async () => {
  // Seed user-1 with a post
  // DELETE /api/users/user-1
  const del = await fetch('/api/users/user-1', { method: 'DELETE' });
  expect(del.status).toBe(200);

  // Posts should be gone
  const posts = await getPostsByUser('user-1');
  expect(posts).toHaveLength(0); // ← fails: posts still exist
});
```

**Test D — missing call assertion:**
```typescript
it('DELETE handler calls deleteUserPosts and deleteUserComments', async () => {
  const spy1 = vi.spyOn(postsService, 'deleteUserPosts');
  const spy2 = vi.spyOn(commentsService, 'deleteUserComments');

  await fetch('/api/users/user-1', { method: 'DELETE' });

  expect(spy1).toHaveBeenCalledWith('user-1'); // ← fails: never called
  expect(spy2).toHaveBeenCalledWith('user-1'); // ← fails: never called
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | DELETE returns 200 with deletedAt |
| Test B | Pass | Nonexistent user returns 404 |
| Test C | **Fail** | Posts remain after user deleted — **orphan bug caught** |
| Test D | **Fail** | Cascade functions never called — **missing call caught** |

Tests C and D failing proves the cascade gap. The service files were not in the diff. Optinum found them via downward dependency traversal.

---

## How to Replicate

1. Create the file structure above in any TypeScript project
2. Apply only the AI change (update `route.ts`, leave service files unchanged)
3. Run: `optinum test --diff <this-pr-diff> --spec src/api/users/[id]/route.ts`
4. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "Cascade gap — deleteUserPosts, deleteUserComments exist but not called"

## Validation Criterion

Optinum passes this fixture if and only if:
- Downward blast radius identifies `src/services/posts.ts` and `src/services/comments.ts`
- Tests C and D are generated checking cascade calls were made
- Tests C and D fail when run against the handler that omits the calls

If the downward traversal is skipped or tests C/D are missing — Optinum missed the bug.
