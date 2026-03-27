// No auth at all in before state — public endpoint
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const doc = {
    id: params.id,
    title: "My Document",
    content: "...",
    ownerId: "user-123",
  };
  return Response.json({ doc });
}
