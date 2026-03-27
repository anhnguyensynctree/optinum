export async function debitWallet(
  userId: string,
  amount: number,
): Promise<void> {
  // Simulated: UPDATE wallets SET balance = balance - amount WHERE id = userId
  if (amount <= 0) throw new Error("Invalid amount");
}
