import { z } from "zod";

const ChargeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  customerId: z.string(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const params = ChargeSchema.parse(body);
  // Simulated charge — no idempotency enforcement yet
  return Response.json({ chargeId: "ch_test_123", amount: params.amount });
}
