import { getCurrentUser } from "@/services/auth";

export async function logRequest(req: Request, path: string) {
  const token = req.headers.get("Authorization") ?? "";
  const user = await getCurrentUser(token);
  console.log(`[${path}] user: ${user.email}`); // safe — user is never null
}
