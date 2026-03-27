# Fixture 003: Missing Auth Check

## Pattern

AI adds a new admin endpoint but places it outside the authenticated router group. The `requireAdmin` middleware that protects every other admin route is never applied to the new endpoint — it is publicly accessible.

## Scenario

### Before

`createAdminRouter()` in `router.ts` defines the middleware (`requireAdmin`) and the protected routes (`/api/admin/stats`, `/api/admin/config`). Any route registered here goes through auth. No route outside this registry is considered an admin route.

### What the AI Did

AI added `after/src/api/admin/users/route.ts` as a new standalone file. The endpoint returns a list of all users including emails and roles. The file was not added to `createAdminRouter()`'s `routes` array, so `requireAdmin` is never applied.

### What the AI Forgot

The new route was never registered in `createAdminRouter()`. The router is the auth boundary for all admin endpoints — a route that exists outside it has no middleware. `GET /api/admin/users` is publicly accessible without a token.

## The Bug

```typescript
// after/src/api/admin/users/route.ts
export async function GET(req: Request) {
  // requireAdmin is never called — route not registered in createAdminRouter
  const users = [{ id: "1", email: "alice@example.com", role: "admin" }, ...];
  return Response.json({ users }); // returns sensitive data to anyone
}
```

Test 003-B sends a request with no `Authorization` header. The expected status is `401`. The actual status is `200`. The endpoint returns the full user list to an unauthenticated caller.

## Expected Optinum Behavior

1. Detect that the new file is an admin-namespaced route (`/api/admin/...`)
2. Walk the dependency graph to find the router that governs admin routes
3. Identify that `after/src/api/admin/users/route.ts` is NOT listed in `createAdminRouter()`'s `routes` array
4. Flag the middleware gap: route exists but is not registered under any auth boundary
5. Generate test `003-C` targeting the registration absence
6. Generate test `003-B` as an edge case that must return `FAIL` — unauthenticated request succeeds

## Pass / Fail Criteria

| Check | Pass | Fail |
|---|---|---|
| Router dependency found | `router.ts` in blast radius dependents | `router.ts` missing from dependents |
| Test 003-B generated | Unauthenticated request tested | 003-B not generated |
| Test 003-B result | FAIL — 200 returned instead of 401 | PASS — false negative |
| Test 003-C generated | Registration gap tested | 003-C not generated |
| Test 003-C result | FAIL — route not in routes[] | PASS — false negative |

## Note

This pattern is particularly dangerous because the AI's change is isolated to a new file. Diff review shows only an addition — nothing modified. The omission (not registering in the router) is invisible in a standard code review unless the reviewer knows the routing architecture.
