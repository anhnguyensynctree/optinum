import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("id");
  const user = { id: userId!, email: "user@example.com", name: "Alice" };
  return Response.json({ user }); // ← returns { user: {...} }
}
