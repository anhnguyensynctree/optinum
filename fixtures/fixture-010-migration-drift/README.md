# Fixture 010 — Migration Drift: Schema Column Added Without Migration

## What This Proves

Optinum catches the gap between Prisma schema changes and the actual database state. AI adds new columns to `schema.prisma` and updates service code to use them — but never runs `prisma migrate dev` to generate the SQL migration. The TypeScript compiles cleanly, unit tests pass, but any DB write targeting the new columns fails at runtime with a column-not-found error.

**Real-world origin:** AI was asked to add RBAC (role) and billing tier (plan) to a user model. It updated `schema.prisma` and the service layer but skipped `prisma migrate dev`. Every user creation call started throwing `column "role" does not exist` in production.

## The Setup

The Prisma `User` model gains two fields (`role`, `plan`). The service layer is updated to write them. A new API route uses the updated service. A pre-existing `registerUser()` function is not updated but also breaks because it calls the same service which now writes the new columns.

### Before

- `schema.prisma`: 4-field User model (`id`, `email`, `name`, `createdAt`)
- `src/services/user.ts`: `createUser({ email, name })` — no role or plan

### The AI Change

- `schema.prisma`: adds `role String @default("user")` and `plan String @default("free")`
- `src/services/user.ts`: updated to accept and return `role` and `plan`
- `src/api/users/route.ts`: new route that passes `role`/`plan` to `createUser`
- **Missing:** `prisma/migrations/[timestamp]_add_role_plan.sql` — never generated

### What AI Forgot

No migration was generated. The database schema is still the 4-field version. Any call to `createUser` that writes `role` or `plan` will fail at the DB driver level with a column-not-found error. This includes `registerUser()` in `src/auth/register.ts`, which was not updated but is now broken by the missing migration.

---

## What Optinum Must Do

### Step 1 — Detect missing migration artifact

```
Changed: prisma/schema.prisma → User model now has role, plan fields
Expected artifact: prisma/migrations/[timestamp]_add_role_plan.sql
Actual: no migration file exists in after/prisma/migrations/
→ Migration drift detected
```

### Step 2 — Blast radius

```
Changed: schema.prisma, src/services/user.ts, src/api/users/route.ts
Upward dependents: src/auth/register.ts → calls createUser() → hits same missing-column error
```

### Step 3 — Tests generated

**Test A — happy path (would pass if migration existed):**
```typescript
it('POST /api/users creates user with role and plan', async () => {
  const res = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'alice@example.com', name: 'Alice', role: 'admin', plan: 'pro' }),
  });
  expect(res.status).toBe(201);
});
```

**Test C — migration artifact check (catches the bug):**
```typescript
it('migration file exists for role/plan columns', () => {
  const migrationsDir = 'prisma/migrations';
  const files = fs.readdirSync(migrationsDir);
  const hasMigration = files.some(f => f.includes('add_role_plan') || f.endsWith('.sql'));
  expect(hasMigration).toBe(true); // ← FAILS: no migration file present
});
```

**Test D — registerUser caller (upward blast radius):**
```typescript
it('registerUser does not fail due to missing migration', async () => {
  // registerUser() calls createUser() which writes role/plan — columns don't exist
  await expect(registerUser('alice@example.com', 'Alice')).resolves.toBeDefined();
  // ← FAILS: DB throws column "role" does not exist
});
```

---

## Expected Result

| Test | Expected | Confirms |
|---|---|---|
| Test A | Pass | Happy path defined correctly |
| Test B | Pass | Validation rejects missing email |
| Test C | **Fail** | No migration file — schema drifted from DB |
| Test D | **Fail** | `registerUser` caller caught via upward blast radius |

---

## How to Replicate

1. Apply the AI change: update `schema.prisma` and service files but do NOT run `prisma migrate dev`
2. Run: `optinum test --diff <this-pr-diff> --spec prisma/schema.prisma`
3. Expected: 4 tests generated, Tests C and D fail, Optinum reports: "Migration artifact missing for schema change"

## Validation Criterion

Optinum passes this fixture if and only if:
- It detects that `schema.prisma` changed but no migration SQL file was added
- Test C is generated checking for the migration artifact
- `src/auth/register.ts` is identified as an upward dependent (calls `createUser`)
- Test D is generated for `registerUser` and fails
