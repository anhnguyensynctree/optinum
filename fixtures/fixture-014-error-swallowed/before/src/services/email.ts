export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  // Throws on failure — callers can catch and handle accordingly
  const response = await fetch("https://api.email-provider.com/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, body }),
  });
  if (!response.ok) {
    throw new Error(`Email failed: ${response.status}`);
  }
}
