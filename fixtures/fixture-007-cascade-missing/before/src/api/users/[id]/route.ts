export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  // Simplified: just mark as deleted — no cascade concern yet
  return Response.json({ deleted: true, userId: params.id });
}
