import { z } from "zod";

// AI "standardized" to return 200 instead of 201
const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  authorId: z.string().uuid(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const params = CreatePostSchema.parse(body);
  const post = { id: "post-1", ...params, createdAt: new Date().toISOString() };
  return Response.json({ post }); // ← AI CHANGED: was { status: 201 }, now defaults to 200
}
