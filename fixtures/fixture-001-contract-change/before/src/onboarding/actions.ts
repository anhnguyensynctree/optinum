interface User {
  id: string;
  email: string;
}

export async function beginOnboarding(user: User) {
  const res = await fetch("/api/questionnaire", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "full", userId: user.id }),
  });
  if (!res.ok) throw new Error("Failed to begin onboarding");
  return res.json();
}
