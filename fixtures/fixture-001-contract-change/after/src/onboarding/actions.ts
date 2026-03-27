// AI DID NOT UPDATE THIS FILE — still sends old schema { type, userId }
// This is the second caller Optinum must find via upward blast radius traversal

interface User {
  id: string;
  email: string;
}

export async function beginOnboarding(user: User) {
  const res = await fetch("/api/questionnaire", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "full", userId: user.id }), // ← BROKEN: should be { mode, sessionId }
  });
  if (!res.ok) throw new Error("Failed to begin onboarding");
  return res.json();
}
