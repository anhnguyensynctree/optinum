// AI DID NOT UPDATE THIS FILE.
// The catch block never fires because sendEmail now swallows all errors.
// Result: POST always returns { confirmed: true } even when email delivery fails.

import { sendEmail } from "@/services/email";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const order = { id: params.id, email: "customer@example.com", total: 99.99 };
  try {
    await sendEmail(
      order.email,
      "Order Confirmed",
      `Your order ${order.id} is confirmed.`,
    );
    // BROKEN: always returns confirmed=true even when email fails
    return Response.json({ confirmed: true });
  } catch (err) {
    // BROKEN: never reached — sendEmail swallows errors before they propagate here
    return Response.json(
      { error: "Failed to send confirmation email" },
      { status: 500 },
    );
  }
}
