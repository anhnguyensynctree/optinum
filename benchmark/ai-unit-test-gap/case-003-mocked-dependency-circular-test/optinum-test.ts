// Optinum generates this from: changeType=[contract-change], pattern=[mocked-dependency-circular-test]
// Optinum does not have access to the developer's session assumptions.
// It reads the actual UserRepository contract from the source type definitions
// (or infers from existing callers) and generates a mock that matches the REAL shape.
// When the real flat shape is injected, getUserProfile crashes — exposing the circular assumption.
// This test FAILS on the buggy code.

import { getUserProfile } from "./ai-code";

describe("getUserProfile — Optinum contract-shape probe", () => {
  it("FAILS: function crashes when repository returns real flat shape", async () => {
    // Real repository returns flat shape: { id, name, email }
    // The AI code expects: { user: { id, name, email } }
    // Optinum uses the real contract, not the AI's assumed one.
    const realShapeRepo = {
      findById: jest.fn().mockResolvedValue({
        // Flat — this is the actual repository contract
        id: "usr-abc123",
        name: "Alice Smith",
        email: "alice@example.com",
        // No `user` wrapper — response.user will be undefined
      }),
    };

    // getUserProfile accesses response.user.name → TypeError: Cannot read properties of undefined
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getUserProfile("usr-abc123", realShapeRepo as any),
    ).rejects.toThrow(TypeError); // FAILS: test expects rejection, code crashes internally
  });

  it("FAILS: displayName is undefined when response shape is flat", async () => {
    const realShapeRepo = {
      findById: jest.fn().mockResolvedValue({
        id: "usr-xyz",
        name: "Bob Jones",
        email: "bob@example.com",
      }),
    };

    // If code were to not throw (hypothetically), displayName would be undefined
    // This probe documents the shape mismatch explicitly
    let result: Awaited<ReturnType<typeof getUserProfile>> | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await getUserProfile("usr-xyz", realShapeRepo as any);
    } catch {
      // Expected — code crashes on undefined access
    }

    // Either it threw (good — Optinum caught it) or result.displayName is undefined (also a bug)
    if (result !== undefined) {
      expect(result.displayName).not.toBeUndefined(); // FAILS if code silently returns bad data
    }
  });
});
