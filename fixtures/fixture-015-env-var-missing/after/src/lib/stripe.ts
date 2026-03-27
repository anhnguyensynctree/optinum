// AI DID NOT ADD STRIPE_WEBHOOK_SECRET to .env.example when creating this module.
// getWebhookSecret() throws at runtime in any environment where the variable is absent.

import Stripe from "stripe";

export const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  // BROKEN: throws in CI and fresh clones because env var is not documented in .env.example
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return secret;
}
