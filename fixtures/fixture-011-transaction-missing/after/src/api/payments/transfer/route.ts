import { z } from "zod";
import { transferFunds } from "@/services/wallet";

const TransferSchema = z.object({
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
  amount: z.number().positive(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const params = TransferSchema.parse(body);
  const result = await transferFunds(params.fromId, params.toId, params.amount);
  return Response.json({ result });
}
