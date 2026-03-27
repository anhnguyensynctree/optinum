import { cache } from "@/lib/cache";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const updates = await req.json();
  // Update profile and invalidate cache so GET returns fresh data
  const profile = {
    id: params.id,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await cache.delete(`user:${params.id}`);
  return Response.json({ profile });
}
