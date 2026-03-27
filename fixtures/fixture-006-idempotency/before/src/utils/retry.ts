export async function retryPayment(amount: number, customerId: string) {
  const res = await fetch("/api/payments/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "usd", customerId }),
  });
  return res.json();
}
