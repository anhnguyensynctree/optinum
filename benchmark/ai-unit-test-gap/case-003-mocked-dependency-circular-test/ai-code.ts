// Demonstrates: mocked-dependency-circular-test (catalog ID: mocked-dependency-circular-test)
// AI wrote a user profile service that calls an external UserRepository.
// The AI assumed the repository returns `{ user: { id, name, email } }` — a nested
// shape. In reality, the repository returns `{ id, name, email }` (flat). The AI's
// unit test mocks the repository to return the nested shape the code expects, so
// both the implementation and the mock share the same wrong assumption.
// The test passes. Production fails with `Cannot read properties of undefined (reading 'id')`.

export interface UserRecord {
  id: string;
  name: string;
  email: string;
}

// The real repository returns: { id, name, email } (flat shape)
// The AI assumed it returns: { user: { id, name, email } } (nested)
export interface UserRepository {
  findById(id: string): Promise<{ user: UserRecord }>; // Wrong — actual shape is flat
}

export interface UserProfileResult {
  displayName: string;
  email: string;
  avatarUrl: string;
}

export async function getUserProfile(
  userId: string,
  repo: UserRepository,
): Promise<UserProfileResult> {
  const response = await repo.findById(userId);
  // Accesses response.user.name — works against mock, fails against real repo
  return {
    displayName: response.user.name,
    email: response.user.email,
    avatarUrl: `https://avatars.example.com/${response.user.id}`,
  };
}
