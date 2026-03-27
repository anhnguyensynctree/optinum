import { z } from "zod";

// AI updated this file: renamed 'type' → 'mode', replaced 'userId' with 'sessionId'
export const QuestionnaireRequestSchema = z.object({
  mode: z.enum(["quick", "full"]),
  sessionId: z.string().uuid(),
});

export type QuestionnaireRequest = z.infer<typeof QuestionnaireRequestSchema>;

export async function POST(req: Request) {
  const body = await req.json();
  const params = QuestionnaireRequestSchema.parse(body);
  return Response.json({ started: true, mode: params.mode });
}
