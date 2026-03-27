import { z } from "zod";

// AI refactored to standard API response shape
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("id");
  const user = { id: userId!, email: "user@example.com", name: "Alice" };
  return Response.json({ data: user }); // ← AI changed: { user } → { data: user }
}
