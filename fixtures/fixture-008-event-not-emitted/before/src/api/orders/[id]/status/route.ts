import { emitEvent } from "@/lib/events";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { status } = await req.json();
  // Update order status
  const order = { id: params.id, status, updatedAt: new Date().toISOString() };
  await emitEvent("OrderStatusChanged", { orderId: params.id, status });
  return Response.json({ order });
}
