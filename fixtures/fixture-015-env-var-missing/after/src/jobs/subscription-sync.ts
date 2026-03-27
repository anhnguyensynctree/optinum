// AI DID NOT UPDATE THIS FILE.
// validateWebhookSignature calls getWebhookSecret(), which throws when
// STRIPE_WEBHOOK_SECRET is absent. The catch block masks the error as a false return,
// making CI failures appear as silent auth rejections rather than config errors.

import { getWebhookSecret } from "@/lib/stripe";

export async function validateWebhookSignature(
  sig: string,
  body: string,
): Promise<boolean> {
  try {
    // BROKEN: getWebhookSecret() throws in CI because STRIPE_WEBHOOK_SECRET is
    // absent from .env.example — new environments never know to set this variable
    const secret = getWebhookSecret();
    return secret.startsWith("whsec_");
  } catch {
    return false;
  }
}
