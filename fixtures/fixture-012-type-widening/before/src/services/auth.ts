export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function getCurrentUser(token: string): Promise<User> {
  // Before: always returns User (throws if invalid)
  if (!token) throw new Error("No token");
  return {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    role: "user",
  };
}
