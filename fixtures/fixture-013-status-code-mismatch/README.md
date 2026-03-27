# Fixture 013 — Status Code Mismatch: 201 Changed to 200 Breaks Callers

## What This Proves

Optinum catches HTTP status code contract changes where AI "standardizes" a response code without updating callers that perform explicit status checks. A `POST` endpoint changes from `201 Created` to `200 OK`. Callers that check `res.status === 201` now treat every successful response as a failure — the operation completes server-side but clients see an error or receive null.

**Real-world origin:** AI was refactoring API response consistency and changed a create endpoint from `Response.json({ post }, { status: 201 })` to `Response.json({ post })` (defaulting to 200). Two callers in the blog and CMS modules checked `res.status === 201` explicitly. Both started failing or returning null silently on every successful post creation.

## The Setup

`POST /api/posts` returns `201 Created` on success. Two callers — `createPost()` in blog and `publishPost()` in CMS — both check `res.status === 201` to confirm success. AI changes the route to return `200` (default). Both callers are not updated.

### Before

- `src/api/posts/route.ts`: `Response.json({ post }, { status: 201 })`
- `src/blog/actions.ts`: `if (res.status !== 201) throw new Error("Post creation failed")`
- `src/cms/publisher.ts`: `return res.status === 201 ? await res.json() : null`

### The AI Change

- `src/api/posts/route.ts`: `Response.json({ post })` — drops `{ status: 201 }`, defaults to 200
- **Not updated:** `src/blog/actions.ts` — still checks `!== 201`, throws on every success
- **Not updated:** `src/cms/publisher.ts` — still checks `=== 201`, returns null on every success

### What AI Forgot

HTTP status codes are part of the API contract. Callers that depend on a specific status code are callers of the contract, not just callers of the function. `201` signals semantic meaning (resource created) distinct from `200` (generic success). Both callers encode that semantic expectation explicitly. Changing the code without updating callers silently breaks both — no TypeScript error, no compile failure, tests that mock `fetch` at the wrong level will pass.

---

## What Optinum Must Do

### Step 1 — Detect status code change in diff

```
Changed: src/api/posts/route.ts
Before: Response.json({ post }, { status: 201 })
After:  Response.json({ post })   ← implicit 200
→ HTTP status contract changed: 201 → 200
```

### Step 2 — Blast radius (upward — fetch callers checking status)

```
Upward dependents checking /api/posts response status:
→ src/blog/actions.ts   → checks res.status !== 201 — now always throws
→ src/cms/publisher.ts  → checks res.status === 201 — now always returns null
```

### Step 3 — Tests generated

**Test A — new contract:**
```typescript
it('POST /api/posts with valid payload returns 200', async () => {
  const res = await fetch('/api/posts', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Hello World',
      content: 'First post',
      authorId: '123e4567-e89b-12d3-a456-426614174000',
    }),
  });
  expect(res.status).toBe(200);
});
```

**Test C — createPost caller (catches the bug):**
```typescript
it('createPost resolves without throwing on successful post creation', async () => {
  // Server returns 200 (new contract), but createPost checks status !== 201
  global.fetch = vi.fn().mockResolvedValue({ status: 200, json: () => ({ post: {} }) });
  // ← FAILS: throws "Post creation failed" because 200 !== 201
  await expect(createPost('Hello', 'Content', '123e4567-...')).resolves.toBeDefined();
});
```

**Test D — publishPost caller:**
```typescript
it('publishPost returns post data on successful creation', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: () => ({ post: { id: 'post-1', title: 'Hello' } }),
  });
  // ← FAILS: returns null because 200 !== 201
  const result = await publishPost('Hello', 'Content', '123e4567-...');
  expect(result).not.toBeNull();
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | New contract is valid (200 accepted) |
| Test B | Pass | Validation still rejects missing fields |
| Test C | **Fail** | `createPost` throws on success — checks old status code |
| Test D | **Fail** | `publishPost` returns null on success — checks old status code |

---

## How to Replicate

1. Apply the AI change: remove `{ status: 201 }` from the route, leave callers unchanged
2. Run: `optinum test --diff <this-pr-diff> --spec src/api/posts/route.ts`
3. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "HTTP status contract changed — 2 callers check old status code 201"

## Validation Criterion

Optinum passes this fixture if and only if:
- It detects the status code change from `201` to `200` in the route diff
- Both `src/blog/actions.ts` and `src/cms/publisher.ts` are identified as upward dependents
- Test C is generated verifying `createPost` behavior against the new status and fails
- Test D is generated verifying `publishPost` returns non-null and fails
