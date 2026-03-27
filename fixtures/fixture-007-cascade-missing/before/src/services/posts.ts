export async function deleteUserPosts(userId: string): Promise<void> {
  // Would delete all posts for userId
}

export async function getPostsByUser(userId: string) {
  return [{ id: "post-1", userId, title: "Hello World", content: "..." }];
}
