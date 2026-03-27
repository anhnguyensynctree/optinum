// AI DID NOT UPDATE THIS FILE.
// sendWelcomeEmail now always returns true because sendEmail swallows errors.
// The catch block is dead code — it will never execute.

import { sendEmail } from "@/services/email";

export async function sendWelcomeEmail(
  userId: string,
  email: string,
): Promise<boolean> {
  try {
    await sendEmail(email, "Welcome!", "Thanks for signing up.");
    return true;
  } catch {
    // BROKEN: catch block never fires — sendEmail swallows all errors
    // sendWelcomeEmail now always returns true, even on email delivery failure
    return false;
  }
}
