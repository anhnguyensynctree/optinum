// AI DID NOT UPDATE THIS FILE — still sends old schema { type, userId }
// This is the bug Optinum must catch via upward blast radius traversal

export async function startQuestionnaire(
  userId: string,
  type: "quick" | "full",
) {
  const res = await fetch("/api/questionnaire", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, userId }), // ← BROKEN: should be { mode, sessionId }
  });
  if (!res.ok) throw new Error("Failed to start questionnaire");
  return res.json();
}
