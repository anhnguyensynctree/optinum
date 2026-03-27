import { debitWallet } from "./debit";
import { creditLedger } from "./ledger";

// AI DID NOT WRAP IN TRANSACTION — two separate DB calls
// If creditLedger() throws, debitWallet() already committed — funds lost
export async function transferFunds(
  fromId: string,
  toId: string,
  amount: number,
) {
  await debitWallet(fromId, amount); // ← commits immediately
  await creditLedger(fromId, toId, amount); // ← if this throws, debit is NOT rolled back
  return { transferId: "tx-1", from: fromId, to: toId, amount };
}
