import { getCurrentUser } from "@/services/auth";

export async function GET(req: Request) {
  const token = req.headers.get("Authorization") ?? "";
  const user = await getCurrentUser(token);
  return Response.json({ name: user.name, email: user.email }); // safe — user is never null
}
