export async function creditLedger(
  fromId: string,
  toId: string,
  amount: number,
): Promise<void> {
  // Simulated: INSERT INTO ledger (from_id, to_id, amount, created_at)
  // This can fail (network timeout, constraint violation, etc.)
  if (!toId) throw new Error("toId required");
}
