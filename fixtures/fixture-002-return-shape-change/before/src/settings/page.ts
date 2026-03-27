export async function loadSettings(userId: string) {
  const res = await fetch(`/api/users?id=${userId}`);
  const { user } = await res.json(); // ← destructures { user }
  return { email: user.email };
}
