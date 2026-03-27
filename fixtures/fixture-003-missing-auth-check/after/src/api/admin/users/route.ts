// AI DID NOT REGISTER THIS IN createAdminRouter — no middleware applied
// New endpoint added standalone, bypasses requireAdmin middleware

export async function GET(req: Request) {
  // AI forgot: this endpoint is not registered in createAdminRouter, so requireAdmin never runs
  const users = [
    { id: "1", email: "alice@example.com", role: "admin" },
    { id: "2", email: "bob@example.com", role: "user" },
  ];
  return Response.json({ users });
}
