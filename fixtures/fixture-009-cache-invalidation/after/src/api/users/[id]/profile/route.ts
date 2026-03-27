// AI DID NOT PRESERVE CACHE INVALIDATION — rewrote handler, lost cache.delete() call and import

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const updates = await req.json();
  const profile = {
    id: params.id,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  // ← BROKEN: cache.delete(`user:${params.id}`) was here before and was dropped in the rewrite
  // GET /api/users/[id] reads from cache first — it will now serve stale data indefinitely after PUT
  return Response.json({ profile });
}
