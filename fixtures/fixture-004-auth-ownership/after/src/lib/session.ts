export interface Session {
  userId: string;
  email: string;
}

export async function getSession(req: Request): Promise<Session | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  // Simulate token decode
  return { userId: token, email: `${token}@example.com` };
}
