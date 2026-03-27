// AI DID NOT UPDATE THIS FILE — assumes transferFunds is atomic (it was before)
import { transferFunds } from "@/services/wallet";

export async function chargeSubscription(userId: string, amount: number) {
  // ← BROKEN: transferFunds is no longer atomic — partial failure loses funds
  return transferFunds(userId, "platform-wallet", amount);
}
