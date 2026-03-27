// Before: no webhook verification — no env var dependencies
export async function POST(req: Request) {
  const event = await req.json();
  // Handle event (no signature verification)
  return Response.json({ received: true });
}
