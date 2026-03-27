// AI DID NOT UPDATE THIS FILE — deleteUserPosts() exists but is never called from the delete route
export async function deleteUserPosts(userId: string): Promise<void> {
  // Would delete all posts for userId
  // This must be called before or during user deletion to avoid orphaned records
}

export async function getPostsByUser(userId: string) {
  return [{ id: "post-1", userId, title: "Hello World", content: "..." }];
}
