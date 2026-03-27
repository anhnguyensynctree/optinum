export async function submitPayment(amount: number, customerId: string) {
  const res = await fetch("/api/payments/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "usd", customerId }),
  });
  if (!res.ok) throw new Error("Payment failed");
  return res.json();
}
