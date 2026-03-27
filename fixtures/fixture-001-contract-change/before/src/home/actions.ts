export async function startQuestionnaire(
  userId: string,
  type: "quick" | "full",
) {
  const res = await fetch("/api/questionnaire", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, userId }),
  });
  if (!res.ok) throw new Error("Failed to start questionnaire");
  return res.json();
}
