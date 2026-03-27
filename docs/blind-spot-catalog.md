# Blind Spot Catalog

AI coding agents have systematic, predictable failure patterns. They write happy paths thoroughly and miss integration boundary conditions — not randomly, but in ways shaped by their training distribution. The blind spot catalog encodes these patterns so Optinum can generate targeted tests for each one.

Catalog version: `0.1.0`. All patterns are currently marked `provisional` pending OSS benchmark validation.

## Change Types

The classifier assigns one of these types to each diff:

| Change Type | Trigger |
|---|---|
| `contract-change` | API schema fields added, removed, renamed, or status codes changed |
| `new-write-endpoint` | New route or mutation endpoint added |
| `cascade-change` | Delete/update with side effects, event emission, cache, error handling |
| `schema-migration` | ORM model changed (Prisma, SQLAlchemy, Drizzle) |
| `type-widening` | Return type changed to include `null` or `undefined` |

---

## contract-change Patterns

### `params-renamed` — Renamed API Parameters
**Severity:** high

AI renames request parameters in the route handler schema but callers in other files still send the old parameter names, causing validation failures at runtime.

**Test strategy:** Send a request with the old parameter name. Expect validation failure (4xx). Verify the renamed parameter name is accepted.

---

### `return-shape-changed` — Changed Response Shape
**Severity:** high

AI restructures the API response object (e.g., wraps data in a nested key) but callers destructure the old shape, causing TypeError at runtime when accessing missing properties.

**Test strategy:** Send a valid request. Verify the response body contains the new shape (e.g., `data` wrapper). Verify callers that access the old flat shape fail.

---

### `required-field-added` — New Required Field Not Sent by Callers
**Severity:** critical

AI adds a new required field to the API schema but callers in the blast radius do not send this field, causing schema validation errors on every call.

**Test strategy:** Omit the new required field. Expect 400/422. Send it. Expect 200.

---

### `field-removed` — Removed Field Still Sent by Callers
**Severity:** medium

AI removes a field from the API schema (strict validation mode) but callers still send it, causing validation failures or silent data loss.

**Test strategy:** Send the removed field. In strict mode, expect 400. In passthrough mode, verify no data loss.

---

### `status-code-changed` — HTTP Status Code Changed
**Severity:** medium

AI changes the HTTP status code returned by an endpoint (e.g., 201 → 200) but callers check the old status code to determine success, causing silent logic failures.

**Test strategy:** Send a valid request. Assert the new status code is returned. Verify caller logic that branches on status code handles the new value.

---

## new-write-endpoint Patterns

### `idempotency-missing` — Idempotency Key Not Sent by Callers
**Severity:** critical

AI adds an idempotency key requirement to a payment or mutation endpoint schema but callers that trigger the endpoint do not generate or send the idempotency key, causing duplicate operations.

**Test strategy:** Send a request without `idempotencyKey`. Verify the endpoint rejects it or creates a duplicate. Send with a key. Verify exactly one side effect.

---

### `auth-ownership-gap` — Auth Check Without Ownership Verification
**Severity:** critical

AI adds authentication check (user is logged in) to a new endpoint but omits ownership check (user owns the resource), enabling any authenticated user to access any other user's data (IDOR vulnerability).

**Test strategy:** Authenticate as user A. Request a resource belonging to user B. Expect 403.

---

### `auth-check-missing` — New Endpoint Added Outside Auth Middleware
**Severity:** critical

AI adds a new route or endpoint file outside the authenticated router group, bypassing all authentication middleware. The endpoint is publicly accessible when it should be protected.

**Test strategy:** Send an unauthenticated request to the new endpoint. Expect 401.

---

### `input-trust-violation` — Sanitization at HTTP Boundary Bypassed by Internal Callers
**Severity:** high

AI adds input sanitization at the HTTP handler level but internal callers (background jobs, service methods) call the underlying service function directly, bypassing sanitization entirely.

**Test strategy:** Trigger the service method directly with unsanitized input. Verify the sanitization layer is still applied.

---

### `transaction-missing` — Multi-Step Operation Without Database Transaction
**Severity:** critical

AI implements a multi-step write operation (debit + credit, create + update) as sequential database calls without wrapping in a transaction. Partial failures leave the database in an inconsistent state.

**Test strategy:** Simulate a failure after the first write. Verify the first write is rolled back (no partial state persisted).

---

## cascade-change Patterns

### `cascade-blindness` — Delete/Update Without Cascading to Related Entities
**Severity:** high

AI implements a delete or update operation on a parent entity but does not cascade the operation to related child entities, leaving orphaned records or inconsistent state.

**Test strategy:** Delete/update the parent. Verify related child records are also deleted/updated.

---

### `event-not-emitted` — Event Emission Dropped During Refactor
**Severity:** high

AI refactors an event-emitting handler and silently drops the event emission call. Downstream listeners and notification handlers never fire, breaking async workflows.

**Test strategy:** Trigger the handler. Verify the expected event is emitted (spy on event bus / message queue).

---

### `cache-invalidation-missing` — Write Handler Loses Cache Invalidation
**Severity:** medium

AI rewrites a write handler and loses the cache invalidation call. Subsequent reads return stale cached data until TTL expires.

**Test strategy:** Write a value. Read it back. Verify the cache was invalidated and the fresh value is returned.

---

### `error-swallowed` — Error Handler Swallows Exceptions Silently
**Severity:** high

AI wraps a critical operation in a try/catch that swallows all errors without re-throwing or logging. Failures become invisible: callers' catch blocks never fire, monitoring sees no errors.

**Test strategy:** Force an error condition. Verify it propagates to the caller (is not swallowed).

---

## schema-migration Patterns

### `migration-drift` — ORM Schema Updated Without Migration File
**Severity:** critical

AI updates the ORM schema model (Prisma, SQLAlchemy, Drizzle) to add fields or change column types but does not create the corresponding migration file. The database schema lags behind the code.

**Test strategy:** Verify a migration file exists with a timestamp newer than the model change. Verify the migration includes the schema delta.

---

## type-widening Patterns

### `type-widening` — Return Type Widened to Include Null
**Severity:** high

AI changes a function return type from `T` to `T | null` (or adds `undefined`) but callers access properties on the return value without null checks, causing runtime TypeError on the null path.

**Test strategy:** Trigger the null return path. Verify callers handle it without throwing.

---

## Adding Patterns

The catalog is loaded from `src/catalog/blind-spot-catalog.json`. Each pattern requires: `id`, `name`, `changeType`, `description`, `testPattern`, `severity`. Set `provisional: false` only after OSS benchmark validation. See `src/catalog/catalog-schema.json` for the full schema.
