import { sanitizeHtml } from "@/lib/sanitize";
import { saveMessage } from "@/services/message";

export async function POST(req: Request) {
  const { content, userId } = await req.json();
  const clean = sanitizeHtml(content); // ← AI added sanitization here
  return Response.json(await saveMessage(clean, userId));
}
