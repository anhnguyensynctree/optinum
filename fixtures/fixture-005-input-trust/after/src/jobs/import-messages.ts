// AI DID NOT UPDATE THIS FILE — background job calls saveMessage() directly
// sanitizeHtml() in the HTTP handler is never called for imported messages
import { saveMessage } from "@/services/message";

export async function importMessagesFromCSV(
  rows: Array<{ content: string; userId: string }>,
) {
  // ← BROKEN: no sanitization before calling saveMessage — XSS payloads go straight to DB
  for (const row of rows) {
    await saveMessage(row.content, row.userId); // ← BROKEN: sanitizeHtml not called
  }
}
