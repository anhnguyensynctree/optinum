// AI DID NOT UPDATE THIS FILE — publishPost returns null on success because status is 200 not 201
export async function publishPost(
  title: string,
  content: string,
  authorId: string,
) {
  const res = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, authorId }),
  });
  // ← BROKEN: res.status === 200, so this returns null instead of the post
  return res.status === 201 ? await res.json() : null;
}
