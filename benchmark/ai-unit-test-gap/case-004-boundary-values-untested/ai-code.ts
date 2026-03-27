// Demonstrates: boundary-values-untested (catalog ID: boundary-values-untested)
// AI wrote a discount calculation function. The logic has two subtle boundary bugs:
// (1) When items array is empty, the function divides by zero (NaN result returned as 0 via || fallback, but averagePrice is NaN)
// (2) When discount > 100, the function returns a negative total — callers that show
//     the price treat negative as a valid discount, undercharging customers.
// The AI's test uses only the happy-path inputs it demonstrated in the docstring.

export interface CartItem {
  productId: string;
  priceInCents: number;
  quantity: number;
}

export interface DiscountResult {
  originalTotalCents: number;
  discountAmountCents: number;
  finalTotalCents: number;
  averagePriceCents: number;
}

/**
 * Calculates discount for a cart.
 * @param items - cart items (non-empty)
 * @param discountPercent - discount percentage 0-100
 */
export function calculateDiscount(
  items: CartItem[],
  discountPercent: number,
): DiscountResult {
  const originalTotal = items.reduce(
    (sum, item) => sum + item.priceInCents * item.quantity,
    0,
  );

  // BUG 1: items.length can be 0 → division by zero → NaN
  const averagePrice = originalTotal / items.length;

  // BUG 2: discountPercent > 100 → discountAmount > originalTotal → negative finalTotal
  const discountAmount = Math.round((originalTotal * discountPercent) / 100);
  const finalTotal = originalTotal - discountAmount;

  return {
    originalTotalCents: originalTotal,
    discountAmountCents: discountAmount,
    finalTotalCents: finalTotal,
    averagePriceCents: averagePrice,
  };
}
