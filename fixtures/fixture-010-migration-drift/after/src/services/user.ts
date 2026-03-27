// AI updated to pass role and plan — but no migration was run, DB doesn't have these columns

interface CreateUserParams {
  email: string;
  name: string;
  role?: string;
  plan?: string;
}

export async function createUser(params: CreateUserParams) {
  // ← BROKEN: DB insert will fail — columns 'role' and 'plan' don't exist in actual DB (no migration)
  return {
    id: "user-1",
    ...params,
    role: params.role ?? "user",
    plan: params.plan ?? "free",
    createdAt: new Date().toISOString(),
  };
}
