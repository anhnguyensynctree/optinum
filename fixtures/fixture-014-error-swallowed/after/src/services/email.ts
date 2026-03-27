// AI DID ADD error handling — but wrapped in try/catch that swallows the error.
// Callers that rely on thrown errors to detect failures will NEVER see failures.
// Contract break: function previously threw on failure; now it silently returns void.

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  try {
    const response = await fetch("https://api.email-provider.com/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
    });
    if (!response.ok) {
      // BROKEN: error is swallowed — should re-throw or return an error signal
      console.log(`Email send failed: ${response.status}`);
    }
  } catch (err) {
    // BROKEN: network errors are also swallowed
    console.log("Email service unreachable", err);
  }
  // Function returns void — callers cannot distinguish success from failure
}
