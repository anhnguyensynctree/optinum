// AI DID NOT PRESERVE EVENT EMISSION — refactored handler but lost the emitEvent call
// The import was also removed, making the omission invisible to import checkers

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { status } = await req.json();
  const order = { id: params.id, status, updatedAt: new Date().toISOString() };
  // ← BROKEN: emitEvent("OrderStatusChanged", ...) was here before refactor and was dropped
  // Downstream services (notifications, inventory) rely on this event — they will never fire now
  return Response.json({ order });
}
