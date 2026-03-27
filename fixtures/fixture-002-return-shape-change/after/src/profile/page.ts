// AI DID NOT UPDATE THIS FILE — still destructures { user } but API now returns { data }
export async function loadProfile(userId: string) {
  const res = await fetch(`/api/users?id=${userId}`);
  const { user } = await res.json(); // ← BROKEN: should be { data }
  return { name: user.name, email: user.email }; // ← TypeError: cannot read 'name' of undefined
}
