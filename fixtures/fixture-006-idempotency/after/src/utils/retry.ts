// AI DID NOT UPDATE THIS FILE — retry utility also missing idempotencyKey
export async function retryPayment(amount: number, customerId: string) {
  const res = await fetch("/api/payments/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // ← BROKEN: missing idempotencyKey — retry calls without it will always fail validation
    body: JSON.stringify({ amount, currency: "usd", customerId }),
  });
  return res.json();
}
