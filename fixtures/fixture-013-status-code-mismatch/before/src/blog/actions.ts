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
  if (res.status !== 201) throw new Error("Post creation failed"); // ← checks for 201
  return res.json();
}
