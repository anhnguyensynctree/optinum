// Listens for OrderStatusChanged to send emails
export async function onOrderStatusChanged(event: {
  orderId: string;
  status: string;
}) {
  if (event.status === "shipped") {
    await sendShippingEmail(event.orderId);
  }
}

async function sendShippingEmail(orderId: string) {
  // Send shipping confirmation email
}
