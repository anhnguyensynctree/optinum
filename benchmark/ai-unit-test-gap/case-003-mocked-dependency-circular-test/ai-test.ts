// Demonstrates: AI-generated test that PASSES despite the circular mock assumption
// The AI wrote both getUserProfile and this test. It assumed UserRepository.findById
// returns { user: { ... } }. The mock reflects that assumption exactly.
// The code accesses response.user.name — works against this mock.
// Against the real repository (flat shape), response.user is undefined → TypeError.
// Both the code and the mock are wrong in the same way. The test proves nothing.

import { getUserProfile } from "./ai-code";
import type { UserRepository } from "./ai-code";

describe("getUserProfile", () => {
  it("returns formatted profile for a valid user", async () => {
    const mockRepo: UserRepository = {
      // AI mocks the shape it assumed the dependency returns: { user: { ... } }
      // Real repository returns: { id, name, email } — flat
      findById: jest.fn().mockResolvedValue({
        user: {
          id: "usr-abc123",
          name: "Alice Smith",
          email: "alice@example.com",
        },
      }),
    };

    const result = await getUserProfile("usr-abc123", mockRepo);

    expect(result.displayName).toBe("Alice Smith");
    expect(result.email).toBe("alice@example.com");
    expect(result.avatarUrl).toBe("https://avatars.example.com/usr-abc123");
  });

  it("calls findById with the correct user id", async () => {
    const mockRepo: UserRepository = {
      findById: jest.fn().mockResolvedValue({
        user: { id: "usr-xyz", name: "Bob", email: "bob@example.com" },
      }),
    };

    await getUserProfile("usr-xyz", mockRepo);

    expect(mockRepo.findById).toHaveBeenCalledWith("usr-xyz");
  });
});
// Both tests PASS — test suite is green — TypeError ships to production
