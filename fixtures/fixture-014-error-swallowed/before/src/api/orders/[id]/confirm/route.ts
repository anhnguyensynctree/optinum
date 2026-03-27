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
    return Response.json({ confirmed: true });
  } catch (err) {
    return Response.json(
      { error: "Failed to send confirmation email" },
      { status: 500 },
    );
  }
}
