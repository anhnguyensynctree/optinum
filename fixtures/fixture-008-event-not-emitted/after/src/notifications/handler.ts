// AI DID NOT UPDATE THIS FILE — still listens for OrderStatusChanged but event is never emitted
export async function onOrderStatusChanged(event: {
  orderId: string;
  status: string;
}) {
  if (event.status === "shipped") {
    // ← BROKEN: this block will never execute — the event that triggers it was dropped
    await sendShippingEmail(event.orderId);
  }
}

async function sendShippingEmail(orderId: string) {
  // Send shipping confirmation email — will never be triggered now
}
