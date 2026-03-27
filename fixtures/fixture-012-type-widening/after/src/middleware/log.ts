// AI DID NOT UPDATE THIS FILE — user.email access is unsafe when user is null
import { getCurrentUser } from "@/services/auth";

export async function logRequest(req: Request, path: string) {
  const token = req.headers.get("Authorization") ?? "";
  const user = await getCurrentUser(token);
  // ← BROKEN: user could be null — TypeError: Cannot read properties of null (reading 'email')
  console.log(`[${path}] user: ${user.email}`);
}
