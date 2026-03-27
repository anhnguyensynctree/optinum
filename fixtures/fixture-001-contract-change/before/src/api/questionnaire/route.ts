import { z } from "zod";

export const QuestionnaireRequestSchema = z.object({
  type: z.enum(["quick", "full"]),
  userId: z.string().uuid(),
});

export type QuestionnaireRequest = z.infer<typeof QuestionnaireRequestSchema>;

export async function POST(req: Request) {
  const body = await req.json();
  const params = QuestionnaireRequestSchema.parse(body);
  return Response.json({ sessionId: crypto.randomUUID(), mode: params.type });
}
