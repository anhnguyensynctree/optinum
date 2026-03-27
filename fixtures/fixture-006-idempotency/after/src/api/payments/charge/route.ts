import { z } from "zod";

// AI added idempotencyKey to prevent duplicate charges — but forgot to update callers
const ChargeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  customerId: z.string(),
  idempotencyKey: z.string().uuid(), // ← AI ADDED: required to prevent duplicates
});

export async function POST(req: Request) {
  const body = await req.json();
  // ← BROKEN: will throw ZodError when callers send { amount, currency, customerId } without idempotencyKey
  const params = ChargeSchema.parse(body);
  return Response.json({
    chargeId: "ch_test_123",
    amount: params.amount,
    idempotencyKey: params.idempotencyKey,
  });
}
