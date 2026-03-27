// AI DID NOT UPDATE THIS FILE — sanitization lives only in the HTTP layer
// The service itself accepts raw content — any caller that bypasses the HTTP handler is vulnerable
export async function saveMessage(content: string, userId: string) {
  return { id: "msg-1", content, userId, createdAt: new Date().toISOString() };
}
