// AI DID NOT UPDATE THIS FILE — calls createUser, which now expects role/plan columns that don't exist
import { createUser } from "@/services/user";

export async function registerUser(email: string, name: string) {
  // ← BROKEN: will fail at DB layer — column 'role' does not exist
  return createUser({ email, name });
}
