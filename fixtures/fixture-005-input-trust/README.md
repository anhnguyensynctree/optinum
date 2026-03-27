# Fixture 005: Input Trust Boundary

## Pattern

AI adds input sanitization to the HTTP request handler. The sanitization is correct and the endpoint is now protected. But the same service layer is called directly by a background job that never goes through the HTTP handler — so the sanitization is never applied to imported content. XSS payloads in CSV imports go straight to the database.

## Scenario

### Before

`saveMessage()` in `services/message.ts` has no sanitization. Neither does any caller — the system stores raw content everywhere. There is no sanitization contract implied or enforced anywhere.

### What the AI Did

AI added `sanitizeHtml()` to `after/src/lib/sanitize.ts` and called it in `after/src/api/messages/route.ts` before passing content to `saveMessage()`. The HTTP endpoint is now safe. `POST /api/messages` with an XSS payload correctly strips the `<script>` tag before persisting.

### What the AI Forgot

`after/src/jobs/import-messages.ts` calls `saveMessage()` directly — it imports rows from a CSV and persists each row's content. It has no dependency on the HTTP handler. `sanitizeHtml()` is never imported or called in the job. Any XSS payload in a CSV row is written to the database without sanitization.

The service layer itself was not updated — `saveMessage()` still accepts and stores raw content. The sanitization exists only at one entry point of many.

## The Bug

```typescript
// after/src/jobs/import-messages.ts
for (const row of rows) {
  await saveMessage(row.content, row.userId); // no sanitizeHtml call — XSS goes to DB
}
```

Any attacker who can influence the CSV import (uploaded file, third-party data sync, admin bulk-import) can store arbitrary script tags that execute when other users view the messages.

## Expected Optinum Behavior

1. Detect that `sanitizeHtml` was introduced in the diff and called in `route.ts` before `saveMessage()`
2. Identify `saveMessage()` in `services/message.ts` as the shared service boundary
3. Walk all callers of `saveMessage()` — not just the HTTP route
4. Find `import-messages.ts` as a dependent that calls `saveMessage()` without sanitization
5. Generate test `005-C` asserting that `importMessagesFromCSV` does not call `sanitizeHtml`
6. `005-C` must report `FAIL` — the job bypasses the sanitization boundary

## Pass / Fail Criteria

| Check | Pass | Fail |
|---|---|---|
| Background job found | `import-messages.ts` in blast radius dependents | Not found |
| Test 005-C generated | Import path tested for sanitization call | 005-C not generated |
| Test 005-C result | FAIL — `sanitizeHtml` not called in import path | PASS — false negative |
| Test 005-A result | PASS — HTTP path sanitizes correctly | FAIL — sanitization broken at HTTP layer too |

## Note

This pattern is common when AI adds security controls at the "obvious" entry point (the HTTP handler) without auditing all callers of the underlying service. The HTTP layer is the one the AI sees in context. Background jobs, CLI scripts, and internal service calls are not in the diff and are routinely missed. The fix belongs in `saveMessage()` itself — defense in depth requires sanitization at the service boundary, not just at HTTP ingress.
