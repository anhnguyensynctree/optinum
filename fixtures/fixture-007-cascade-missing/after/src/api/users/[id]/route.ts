// AI added deletion with status tracking — but forgot cascade to posts and comments
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const userId = params.id;
  // AI simulates DB delete with timestamp
  const result = { deleted: true, userId, deletedAt: new Date().toISOString() };
  // ← BROKEN: deleteUserPosts(userId) never called — posts become orphaned records
  // ← BROKEN: deleteUserComments(userId) never called — comments become orphaned records
  // Both functions exist in src/services/ but AI never imported or called them
  return Response.json(result);
}
