// AI DID NOT UPDATE THIS FILE — user could be null but .name is accessed directly
import { getCurrentUser } from "@/services/auth";

export async function GET(req: Request) {
  const token = req.headers.get("Authorization") ?? "";
  const user = await getCurrentUser(token);
  // ← BROKEN: user could be null — TypeError: Cannot read properties of null (reading 'name')
  return Response.json({ name: user.name, email: user.email });
}
