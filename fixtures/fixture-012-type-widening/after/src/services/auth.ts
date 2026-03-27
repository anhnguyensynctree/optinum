// AI changed to return null instead of throwing — better UX but callers not updated

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function getCurrentUser(token: string): Promise<User | null> {
  // ← AI WIDENED return type: was Promise<User>, now Promise<User | null>
  if (!token) return null; // ← was: throw new Error("No token")
  return {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    role: "user",
  };
}
