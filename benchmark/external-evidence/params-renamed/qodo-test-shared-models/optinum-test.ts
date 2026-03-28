// Optinum generates this from: changeType=params-renamed, pattern=params-renamed
// Source repo: https://github.com/Writewyze/qodo-test-shared-models/pull/1
// AI tool: Cursor
// Gap: Cursor renamed User.email → User.emailAddress across schema and most validators.
//      The length-check validation on line 29 still read user.email (old name).
//      user.email is undefined after the rename → the 255-char guard silently never fires.
//      Cursor Bugbot caught it in its own review of the PR it created.

import { describe, it, expect } from "vitest";
import { validateUser } from "./buggy-validator";

describe("params-renamed: all readers updated after email → emailAddress rename", () => {
  it("rejects email address longer than 255 characters", () => {
    // This test exposes the missed reader: user.email is undefined after rename
    // so the length guard never fires — a 300-char email passes validation
    const longEmail = "a".repeat(250) + "@example.com"; // 262 chars
    const user = { emailAddress: longEmail, name: "Test User", age: 25 };

    // AI code: validateUser returns true (length check reads undefined.length → skipped)
    // Correct code: validateUser returns false (length > 255)
    expect(validateUser(user)).toBe(false);
  });

  it("length check uses emailAddress field, not legacy email field", () => {
    // Verify the rename was applied to ALL readers, not just the @ check
    const user = { emailAddress: "x@y.com", name: "Test", age: 20 };
    // Should pass — short valid email
    expect(validateUser(user)).toBe(true);

    const longUser = {
      emailAddress: "a".repeat(260) + "@b.com",
      name: "Test",
      age: 20,
    };
    // Should fail — exceeds 255 chars. Fails on AI code because reader uses old field name.
    expect(validateUser(longUser)).toBe(false);
  });
});
