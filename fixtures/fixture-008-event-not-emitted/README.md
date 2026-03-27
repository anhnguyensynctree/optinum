# Fixture 008 — Event Not Emitted: Downstream Consumers Silently Starved

## What This Proves
Optinum catches the failure where AI refactors a handler and silently drops an event emission. The endpoint still returns 200. The database is updated. But the event bus contract is broken — downstream services that consume `OrderStatusChanged` (email notifications, inventory updates) never fire. No error is raised. No test catches it unless Optinum traces the event contract.

**Real-world origin:** A common AI refactor pattern is to "clean up" a handler by removing unused imports and simplifying the function body. The `emitEvent` call and its import disappear together. The route file diff looks clean. The notification handler is untouched and invisible to reviewers.

## The Setup

An order status PATCH route emits `OrderStatusChanged` before and after the change — but the AI refactor removes the emission. A notification handler (`onOrderStatusChanged`) and the events library (`emitEvent`) remain unchanged.

### Before (original code)

**`src/api/orders/[id]/status/route.ts`** — emits event on every status update
```typescript
import { emitEvent } from "@/lib/events";

export async function PATCH(req, { params }) {
  const { status } = await req.json();
  const order = { id: params.id, status, updatedAt: new Date().toISOString() };
  await emitEvent("OrderStatusChanged", { orderId: params.id, status });
  return Response.json({ order });
}
```

**`src/notifications/handler.ts`** — consumes the event to send shipping emails
```typescript
export async function onOrderStatusChanged(event: { orderId: string; status: string }) {
  if (event.status === "shipped") {
    await sendShippingEmail(event.orderId);
  }
}
```

---

### The AI Change (what goes in the PR diff)

**`src/api/orders/[id]/status/route.ts`** — AI refactors, drops event emission
```typescript
// Import removed, emitEvent call removed
export async function PATCH(req, { params }) {
  const { status } = await req.json();
  const order = { id: params.id, status, updatedAt: new Date().toISOString() };
  // emitEvent("OrderStatusChanged", ...) silently removed
  return Response.json({ order });
}
```

**What AI forgot:** `onOrderStatusChanged` in `src/notifications/handler.ts` is wired to the `OrderStatusChanged` event. That handler now receives nothing. Shipping emails stop. Inventory hooks stop. The response is still 200 — the silence is invisible at the API level.

---

## What Optinum Must Do

### Step 1 — Contract delta detection
```
Before: route called emitEvent("OrderStatusChanged", ...)
After: emitEvent call removed, import removed
Contract delta: removed — emitEvent(OrderStatusChanged)
```

### Step 2 — Blast radius (event consumers)
```
Changed: src/api/orders/[id]/status/route.ts → PATCH handler

Downward (dependencies): src/lib/events.ts → emitEvent (now absent from changed file)
Upward (event consumers): search for onOrderStatusChanged or handlers bound to "OrderStatusChanged"
→ src/notifications/handler.ts → onOrderStatusChanged()
```

### Step 3 — Tests generated

**Test C — event consumer verification:**
```typescript
it('PATCH to shipped triggers onOrderStatusChanged', async () => {
  const spy = vi.spyOn(events, 'emitEvent');

  await fetch('/api/orders/order-1/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'shipped' }),
  });

  expect(spy).toHaveBeenCalledWith('OrderStatusChanged', {
    orderId: 'order-1',
    status: 'shipped',
  }); // ← fails: emitEvent never called
});
```

**Test D — missing call assertion:**
```typescript
it('PATCH handler calls emitEvent', async () => {
  const spy = vi.spyOn(events, 'emitEvent');
  await fetch('/api/orders/order-1/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'processing' }),
  });
  expect(spy).toHaveBeenCalled(); // ← fails: call was removed
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | PATCH returns 200 |
| Test B | Pass | Missing status returns 400 |
| Test C | **Fail** | `OrderStatusChanged` never emitted — **notification bug caught** |
| Test D | **Fail** | `emitEvent` not called in handler — **contract removal caught** |

Tests C and D failing on the PR is the proof. The notification handler was not in the diff. Optinum found it by tracing the event contract that was removed, generated tests against it, and the tests fail.

---

## How to Replicate

1. Create the file structure above in any TypeScript project
2. Apply only the AI change (update `route.ts`, leave all other files unchanged)
3. Run: `optinum test --diff <this-pr-diff> --spec src/api/orders/[id]/status/route.ts`
4. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "Event contract removed: OrderStatusChanged — 1 consumer affected"

## Validation Criterion

Optinum passes this fixture if and only if:
- Contract delta detects `emitEvent(OrderStatusChanged)` was removed
- Blast radius identifies `src/notifications/handler.ts` as an event consumer
- Tests C and D are generated and fail against the broken handler

If `emitEvent` removal is not detected or the notification handler is not found — Optinum missed the bug.
