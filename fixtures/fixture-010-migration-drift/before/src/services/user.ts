interface CreateUserParams {
  email: string;
  name: string;
}

export async function createUser(params: CreateUserParams) {
  // Simulated DB insert
  return { id: "user-1", ...params, createdAt: new Date().toISOString() };
}
