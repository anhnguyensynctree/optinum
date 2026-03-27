// AI DID NOT UPDATE THIS FILE — GET uses cache, will return stale data after PUT
import { cache } from "@/lib/cache";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const cached = await cache.get(`user:${params.id}`);
  // ← STALE: cache.delete() is never called by PUT anymore, so this always hits the cached version
  if (cached) return Response.json({ profile: cached });
  const profile = { id: params.id, email: "user@example.com", name: "Alice" };
  await cache.set(`user:${params.id}`, profile);
  return Response.json({ profile });
}
