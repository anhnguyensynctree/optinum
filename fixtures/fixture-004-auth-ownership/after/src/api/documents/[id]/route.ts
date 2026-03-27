import { getSession } from "@/lib/session";

// AI DID ADD AUTH — but only checks if user is logged in, not if they own the document
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ← BROKEN: never checks session.userId === doc.ownerId
  // Any authenticated user can read any document
  const doc = {
    id: params.id,
    title: "My Document",
    content: "...",
    ownerId: "user-123",
  };
  return Response.json({ doc });
}
