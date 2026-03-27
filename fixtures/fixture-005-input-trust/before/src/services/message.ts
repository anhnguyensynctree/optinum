export async function saveMessage(content: string, userId: string) {
  // Before: no sanitization anywhere
  return { id: "msg-1", content, userId, createdAt: new Date().toISOString() };
}
