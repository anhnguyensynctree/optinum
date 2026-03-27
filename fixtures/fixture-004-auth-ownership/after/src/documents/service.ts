// AI DID NOT UPDATE THIS FILE — service assumes route enforces ownership before calling
// This caller assumes that by the time fetchDocument is called, ownership was verified

export async function fetchDocument(docId: string, requestingUserId: string) {
  // Pre-AI: this function trusted that the route checked ownership
  // Post-AI: route only checks auth, not ownership — this assumption is now wrong
  const doc = {
    id: docId,
    title: "My Document",
    content: "sensitive content",
    ownerId: "user-123",
  };
  // No ownership check here either — double blind spot
  return doc;
}
