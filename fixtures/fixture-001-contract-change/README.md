# Fixture 001 — Contract Change: Caller Not Updated

## What This Proves
Optinum catches integration failures where AI modifies a function's contract (params, return shape, route signature) but forgets to update callers — a bug class that unit tests cannot catch because each piece passes in isolation.

**Real-world origin:** Claude Code changed a questionnaire route's URL params. Unit tests passed on both sides. The home→questionnaire navigation contract broke silently. E2E caught it at runtime. Optinum should catch it at diff time.

## The Setup

A Next.js API route changes its request schema. The handler is updated correctly. Two callers in other files are not updated — they still send the old param shape.

### Before (original code)

**`src/api/questionnaire/route.ts`** — the handler
```typescript
import { z } from 'zod'

const QuestionnaireRequestSchema = z.object({
  type: z.enum(['quick', 'full']),
  userId: z.string().uuid(),
})

export async function POST(req: Request) {
  const body = await req.json()
  const params = QuestionnaireRequestSchema.parse(body)
  // ... handler logic using params.type and params.userId
  return Response.json({ sessionId: crypto.randomUUID() })
}
```

**`src/home/actions.ts`** — caller 1 (not in the diff)
```typescript
export async function startQuestionnaire(userId: string, type: 'quick' | 'full') {
  const res = await fetch('/api/questionnaire', {
    method: 'POST',
    body: JSON.stringify({ type, userId }),  // ← old schema
  })
  return res.json()
}
```

**`src/onboarding/actions.ts`** — caller 2 (not in the diff)
```typescript
export async function beginOnboarding(user: User) {
  const res = await fetch('/api/questionnaire', {
    method: 'POST',
    body: JSON.stringify({ type: 'full', userId: user.id }),  // ← old schema
  })
  return res.json()
}
```

---

### The AI Change (what goes in the PR diff)

**`src/api/questionnaire/route.ts`** — AI updates this file only
```typescript
import { z } from 'zod'

// AI renamed 'type' → 'mode', replaced 'userId' with 'sessionId'
const QuestionnaireRequestSchema = z.object({
  mode: z.enum(['quick', 'full']),       // was: type
  sessionId: z.string().uuid(),          // was: userId
})

export async function POST(req: Request) {
  const body = await req.json()
  const params = QuestionnaireRequestSchema.parse(body)
  // ... handler logic using params.mode and params.sessionId
  return Response.json({ started: true })
}
```

**What AI forgot:** `src/home/actions.ts` and `src/onboarding/actions.ts` still send `{ type, userId }`. Zod will throw a validation error at runtime. Unit tests for the handler pass (they use the new schema). Unit tests for the callers pass (they mock the fetch). Integration is broken.

---

## What Optinum Must Do

### Step 1 — Blast radius (bidirectional)
```
Changed: src/api/questionnaire/route.ts → POST handler, QuestionnaireRequestSchema

Downward (dependencies): z.object (external), crypto.randomUUID (external) — no project-internal deps

Upward (dependents): search all project files for fetch('/api/questionnaire') or direct imports
→ src/home/actions.ts → startQuestionnaire()
→ src/onboarding/actions.ts → beginOnboarding()
```

### Step 2 — Schema detection
```
Schema source: Zod (QuestionnaireRequestSchema in the changed file)
New contract: { mode: 'quick'|'full', sessionId: uuid }
Old contract (from callers): { type: 'quick'|'full', userId: uuid }
Mismatch detected: field names changed
```

### Step 3 — Tests generated

**Test A — new contract accepted:**
```typescript
it('POST /api/questionnaire accepts new schema', async () => {
  const res = await fetch('/api/questionnaire', {
    method: 'POST',
    body: JSON.stringify({ mode: 'quick', sessionId: '123e4567-e89b-12d3-a456-426614174000' }),
  })
  expect(res.status).toBe(200)
})
```

**Test B — old contract rejected (catches the regression):**
```typescript
it('POST /api/questionnaire rejects old schema fields', async () => {
  const res = await fetch('/api/questionnaire', {
    method: 'POST',
    body: JSON.stringify({ type: 'quick', userId: '123e4567-e89b-12d3-a456-426614174000' }),
  })
  expect(res.status).toBe(400)  // Zod validation error
})
```

**Test C — caller contract verification (upward blast radius):**
```typescript
// Generated from finding src/home/actions.ts still sends old schema
it('startQuestionnaire sends params matching current API contract', async () => {
  // Calls the actual function, checks what it sends
  const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) })
  global.fetch = mockFetch

  await startQuestionnaire('123e4567-e89b-12d3-a456-426614174000', 'quick')

  const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
  expect(sentBody).toHaveProperty('mode')       // ← fails: sends 'type' not 'mode'
  expect(sentBody).toHaveProperty('sessionId')  // ← fails: sends 'userId' not 'sessionId'
  expect(sentBody).not.toHaveProperty('type')
  expect(sentBody).not.toHaveProperty('userId')
})
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | New contract is valid |
| Test B | Pass | Old params are rejected |
| Test C | **Fail** | `startQuestionnaire` still sends old schema — **bug caught** |

Test C failing on the PR is the proof. The caller was not in the diff. Optinum found it via upward blast radius, generated a contract verification test, and the test fails — before any build, before any deploy, before any E2E run.

---

## How to Replicate

1. Create the file structure above in any TypeScript/Node.js project
2. Apply only the AI change (update `route.ts`, leave callers unchanged)
3. Run: `optinum test --diff <this-pr-diff> --spec src/api/questionnaire/route.ts`
4. Expected: 3 tests generated, Test C fails, Optinum reports: "Contract mismatch detected in 2 callers"

## Validation Criterion

Optinum passes this fixture if and only if:
- Upward blast radius identifies both `src/home/actions.ts` and `src/onboarding/actions.ts`
- Test C is generated specifically verifying caller sends `mode` + `sessionId`
- Test C fails when run against the unchanged caller code

If Test C is not generated or passes on the broken caller code — Optinum missed the bug.
