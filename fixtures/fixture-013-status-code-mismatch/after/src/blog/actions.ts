// AI DID NOT UPDATE THIS FILE — still checks res.status === 201 but endpoint now returns 200
export async function createPost(
  title: string,
  content: string,
  authorId: string,
) {
  const res = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, authorId }),
  });
  // ← BROKEN: res.status is 200, not 201 — throws "Post creation failed" even on success
  if (res.status !== 201) throw new Error("Post creation failed");
  return res.json();
}
