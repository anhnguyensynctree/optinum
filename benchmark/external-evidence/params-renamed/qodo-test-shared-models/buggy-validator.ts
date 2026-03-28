// As committed — AI renamed email → emailAddress in schema + some validators
// but missed the length-check reader on line 29
// Source: https://github.com/Writewyze/qodo-test-shared-models/pull/1
// AI tool: Cursor (Cursor Bugbot caught the gap in its own PR review)

interface User {
  emailAddress: string; // renamed from email
  name: string;
  age: number;
}

const UserSchema = {
  emailAddress: { type: "string", required: true }, // renamed ✓
};

function validateUser(user: User): boolean {
  // AI updated this reference ✓
  if (!user.emailAddress || !user.emailAddress.includes("@")) {
    return false;
  }

  // BUG: AI missed this reader — still references user.email (old name)
  // user.email is undefined after the rename → length check is 0 → always passes
  if ((user as any).email && (user as any).email.length > 255) {
    return false;
  }

  return true;
}

function sanitizeUser(user: User): User {
  return {
    ...user,
    emailAddress: user.emailAddress.trim().toLowerCase(), // renamed ✓
    name: user.name.trim(),
  };
}

export { User, UserSchema, validateUser, sanitizeUser };
