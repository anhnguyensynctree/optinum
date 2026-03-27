export async function transferFunds(
  fromId: string,
  toId: string,
  amount: number,
) {
  // Before: single atomic operation (simplified)
  return { transferId: "tx-1", from: fromId, to: toId, amount };
}
