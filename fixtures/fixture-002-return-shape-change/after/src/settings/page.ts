// AI DID NOT UPDATE THIS FILE — still destructures { user } but API now returns { data }
export async function loadSettings(userId: string) {
  const res = await fetch(`/api/users?id=${userId}`);
  const { user } = await res.json(); // ← BROKEN: should be { data }
  return { email: user.email }; // ← TypeError
}
