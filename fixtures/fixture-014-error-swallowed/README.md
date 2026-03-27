# Fixture 014 — Error Swallowed

## Blind Spot

AI adds internal try/catch to `sendEmail()` and swallows errors with `console.log`. Callers that depend on a thrown error to detect failure receive no signal — they continue as if the operation succeeded.

## Scenario

An email service is called by two independent callers:

- `POST /api/orders/[id]/confirm` — returns 500 to the user if email fails
- `sendWelcomeEmail` — returns `false` to its caller if email fails

AI "improves" `sendEmail` by adding error handling, but wraps everything in try/catch and never re-throws. Both callers' error paths become dead code. Failures are invisible.

## Files

| File | Role |
|---|---|
| `before/src/services/email.ts` | Throws on failure — safe contract |
| `before/src/api/orders/[id]/confirm/route.ts` | Catches thrown error, returns 500 |
| `before/src/jobs/welcome.ts` | Catches thrown error, returns false |
| `after/src/services/email.ts` | **Bug:** swallows error, always returns void |
| `after/src/api/orders/[id]/confirm/route.ts` | Unchanged — catch block now dead code |
| `after/src/jobs/welcome.ts` | Unchanged — always returns true now |

## What Optinum Must Detect

1. `sendEmail` changed from "throws on failure" to "swallows error silently"
2. Both callers depend on the thrown error — blast radius includes both files
3. Test 014-C: confirm route returns 200 instead of 500 on email failure
4. Test 014-D: welcome job returns `true` instead of `false` on email failure

## Pass Criteria

- Blast radius traversal finds both dependent callers
- Tests 014-C and 014-D are generated and flagged as `FAIL`
- Bug caught via: error contract changed — callers assume throws, function no longer throws
