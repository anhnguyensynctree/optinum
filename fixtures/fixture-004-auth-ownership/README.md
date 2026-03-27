# Fixture 004: Auth Without Ownership

## Pattern

AI adds authentication (is the user logged in?) but skips authorization (does this user own this resource?). The endpoint correctly rejects unauthenticated requests. Any authenticated user — including one who owns nothing — can read or modify any other user's data. This is an Insecure Direct Object Reference (IDOR) vulnerability.

## Scenario

### Before

`GET /api/documents/[id]` has no auth at all — public endpoint. No session check, no ownership check.

### What the AI Did

AI added `getSession()` to the route handler. If no session exists, the route returns `401`. The change is intentional and correct as far as it goes. The diff shows a genuine security improvement — unauthenticated access is now blocked.

### What the AI Forgot

After confirming the session exists, the route never checks whether `session.userId === doc.ownerId`. Any token is valid. User `user-456` can request `doc-1` that belongs to `user-123` and receive a `200` response with the full document content.

The service layer (`documents/service.ts`) also has no ownership check — it was written with the assumption that the route would enforce ownership before calling it. That assumption is now invalid.

## The Bug

```typescript
// after/src/api/documents/[id]/route.ts
const session = await getSession(req);
if (!session) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
// ← Missing: if (session.userId !== doc.ownerId) return 403
const doc = { id: params.id, title: "My Document", content: "...", ownerId: "user-123" };
return Response.json({ doc }); // any authenticated user receives this
```

Test 004-C sends `Authorization: Bearer user-456` (a different user). Expected status: `403`. Actual status: `200`. The document is returned in full.

## Expected Optinum Behavior

1. Detect that `getSession()` was added to the route — authentication boundary established
2. Analyze the post-auth code path for ownership enforcement: `session.userId` vs `doc.ownerId`
3. Flag the missing ownership check — auth present, authorization absent
4. Walk dependents to find `service.ts`, which has no ownership guard either
5. Generate test `004-C` using a non-owner token — must return `FAIL` (gets 200, expects 403)
6. Generate test `004-D` targeting the service layer assumption — must return `FAIL`

## Pass / Fail Criteria

| Check | Pass | Fail |
|---|---|---|
| Ownership gap detected | `missing: ["ownership check"]` in contract delta | Omitted from delta |
| `service.ts` in dependents | Found via blast radius traversal | Not found |
| Test 004-C generated | Cross-user access tested | 004-C not generated |
| Test 004-C result | FAIL — 200 returned for non-owner | PASS — false negative |
| Test 004-D generated | Service layer gap tested | 004-D not generated |
| Test 004-D result | FAIL — no ownership guard in service | PASS — false negative |

## Note

This pattern passes all standard auth tests. Test 004-B (no token → 401) passes correctly. The IDOR only surfaces when testing with a valid token that belongs to a different user — a scenario most AI-generated test suites never include because the AI thinks about "is the user logged in", not "is the user the right user".
