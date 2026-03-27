import { createUser } from "@/services/user";

export async function POST(req: Request) {
  const { email, name, role, plan } = await req.json();
  // ← BROKEN: createUser will write role/plan to DB, but migration was never run
  const user = await createUser({ email, name, role, plan });
  return Response.json({ user }, { status: 201 });
}
