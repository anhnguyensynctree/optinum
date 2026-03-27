# Fixture 015 — Env Var Missing

## Blind Spot

AI adds a new Stripe webhook integration that reads `process.env.STRIPE_WEBHOOK_SECRET` but never documents it in `.env.example`. The variable exists in the developer's local `.env`, so local testing passes. CI environments and fresh clones have no way to know the variable is required.

## Scenario

The Stripe webhook handler and a new `stripe.ts` module both call `getWebhookSecret()`, which throws if the variable is absent. A downstream job (`subscription-sync.ts`) calls `getWebhookSecret()` inside a try/catch and silently returns `false` on config errors — masking the root cause as an auth rejection instead of a missing environment variable.

## Files

| File | Role |
|---|---|
| `before/.env.example` | Baseline — no Stripe variables |
| `before/src/api/webhooks/stripe/route.ts` | No-op webhook handler, no env deps |
| `after/.env.example` | **Bug:** STRIPE_WEBHOOK_SECRET absent despite being required |
| `after/src/api/webhooks/stripe/route.ts` | New — reads STRIPE_WEBHOOK_SECRET |
| `after/src/lib/stripe.ts` | New — getWebhookSecret() throws if var absent |
| `after/src/jobs/subscription-sync.ts` | Unchanged — calls getWebhookSecret(), swallows thrown error as false |

## What Optinum Must Detect

1. `STRIPE_WEBHOOK_SECRET` referenced in code but absent from `.env.example`
2. Blast radius includes `subscription-sync.ts` as a dependent of `stripe.ts`
3. Test 015-C: `.env.example` gap is flagged as a missing artifact
4. Test 015-D: `validateWebhookSignature` fails due to config error, not signature mismatch

## Pass Criteria

- Missing artifact detection: `after/.env.example` lacks `STRIPE_WEBHOOK_SECRET`
- Blast radius traversal finds `after/src/jobs/subscription-sync.ts`
- Tests 015-C and 015-D are generated and flagged as `FAIL`
- Bug caught via: new env var used in code but absent from `.env.example`
