# Fixture 002: Return Shape Change

## Pattern

AI standardizes an API response from a named key (`{ user }`) to a generic data wrapper (`{ data: user }`). The change is locally correct — the endpoint itself works. But every caller that destructures `{ user }` now receives `undefined`, producing a `TypeError` at runtime.

## Scenario

### Before

`GET /api/users` returns `{ user: { id, email, name } }`. Both `loadProfile()` and `loadSettings()` destructure `const { user } = await res.json()` — correct and working.

### What the AI Did

AI refactored `route.ts` to use a "standard API response shape": `Response.json({ data: user })`. This is a common, well-intentioned standardization. The endpoint's own unit tests pass. The change looks clean in isolation.

### What the AI Forgot

`after/src/profile/page.ts` and `after/src/settings/page.ts` both destructure `{ user }` from the response. Neither file was in the AI's diff. Both now receive `user = undefined`. Any access to `user.name` or `user.email` throws `TypeError: Cannot read properties of undefined`.

## The Bug

```typescript
// profile/page.ts — BROKEN after AI change
const { user } = await res.json(); // user is undefined — API returns { data }, not { user }
return { name: user.name, email: user.email }; // TypeError at runtime
```

The bug is silent at compile time. TypeScript cannot catch this because `res.json()` returns `any`. No lint rule flags it. The HTTP handler's unit tests pass. Only a runtime call to `loadProfile()` or `loadSettings()` surfaces the failure.

## Expected Optinum Behavior

1. Detect the return shape change in `after/src/api/users/route.ts`: key `user` removed, key `data` added
2. Walk upward from the changed file to find all callers that consume its response
3. Identify `profile/page.ts` and `settings/page.ts` as dependents that destructure the old key
4. Generate tests `002-C` and `002-D` targeting the broken destructuring patterns
5. Both tests must report `FAIL` — the callers use `{ user }` but the API sends `{ data }`

## Pass / Fail Criteria

| Check | Pass | Fail |
|---|---|---|
| Dependents found | `profile/page.ts` and `settings/page.ts` in blast radius | Either file missing from dependents |
| Test 002-C generated | Caller `loadProfile` tested against new shape | 002-C not generated |
| Test 002-D generated | Caller `loadSettings` tested against new shape | 002-D not generated |
| 002-C result | FAIL — destructures `{ user }`, API returns `{ data }` | PASS — false negative |
| 002-D result | FAIL — destructures `{ user }`, API returns `{ data }` | PASS — false negative |

## Note

AI refactored API response shape to `{ data: T }` (a common standardization pattern) but did not update any callers. Unit tests on the endpoint pass. `loadProfile()` and `loadSettings()` silently return `undefined.name` — a TypeError at runtime.
