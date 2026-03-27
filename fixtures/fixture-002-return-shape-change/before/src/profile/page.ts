export async function loadProfile(userId: string) {
  const res = await fetch(`/api/users?id=${userId}`);
  const { user } = await res.json(); // ← destructures { user }
  return { name: user.name, email: user.email };
}
