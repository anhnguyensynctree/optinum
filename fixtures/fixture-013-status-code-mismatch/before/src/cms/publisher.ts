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
  return res.status === 201 ? await res.json() : null; // ← checks for 201
}
