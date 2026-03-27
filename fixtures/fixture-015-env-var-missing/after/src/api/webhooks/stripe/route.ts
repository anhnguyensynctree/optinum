// AI DID NOT ADD STRIPE_WEBHOOK_SECRET to .env.example.
// Works locally because the developer has it in their local .env.
// Breaks in CI and on fresh clones where the variable is undefined.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    // BROKEN in CI: process.env.STRIPE_WEBHOOK_SECRET is undefined — constructEvent throws
    // "No webhook secret provided" when the argument is undefined
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!, // undefined in CI and fresh clones
    );
  } catch (err) {
    return Response.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  return Response.json({ received: true, type: event.type });
}
