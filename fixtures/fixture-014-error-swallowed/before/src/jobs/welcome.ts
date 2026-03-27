import { sendEmail } from "@/services/email";

export async function sendWelcomeEmail(
  userId: string,
  email: string,
): Promise<boolean> {
  try {
    await sendEmail(email, "Welcome!", "Thanks for signing up.");
    return true;
  } catch {
    return false; // signal failure to caller
  }
}
