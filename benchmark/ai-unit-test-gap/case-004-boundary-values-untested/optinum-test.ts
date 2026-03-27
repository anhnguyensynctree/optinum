// Optinum generates this from: changeType=[type-widening], pattern=[boundary-values-untested]
// Optinum probes the systematic blind spots the AI skips: empty collections, zero,
// maximum/overflow values, and invalid-but-plausible inputs. These are the inputs
// real users send. The AI never generates tests for them because training data shows
// happy-path tests overwhelmingly. Both tests below FAIL on the buggy code.

import { calculateDiscount } from "./ai-code";

describe("calculateDiscount — Optinum boundary probes", () => {
  it("FAILS: empty items array produces NaN averagePriceCents", () => {
    const result = calculateDiscount([], 10);

    // 0 / 0 = NaN — callers that display price get 'NaN' on screen
    expect(Number.isNaN(result.averagePriceCents)).toBe(false); // FAILS — it IS NaN
    expect(result.averagePriceCents).toBe(0); // FAILS — returns NaN, not 0
  });

  it("FAILS: empty items array with 0% discount still returns NaN average", () => {
    const result = calculateDiscount([], 0);

    expect(result.originalTotalCents).toBe(0);
    expect(result.discountAmountCents).toBe(0);
    expect(result.finalTotalCents).toBe(0);
    expect(result.averagePriceCents).toBe(0); // FAILS — NaN, not 0
  });

  it("FAILS: discount > 100 produces negative finalTotalCents", () => {
    // A coupon code bug or API call without validation could send 150%.
    // The function allows it and returns a negative total.
    const result = calculateDiscount(
      [{ productId: "prod-1", priceInCents: 1000, quantity: 1 }],
      150,
    );

    // finalTotal = 1000 - 1500 = -500 — customer gets money back
    expect(result.finalTotalCents).toBeGreaterThanOrEqual(0); // FAILS — returns -500
  });

  it("FAILS: single-item cart average equals item price (not total/1)", () => {
    // Boundary: single item, price 999, quantity 3
    // originalTotal = 2997, items.length = 1 (not 3)
    // averagePriceCents = 2997 / 1 = 2997 — but the average unit price is 999
    // This is a semantic bug: AI divides by item count, not unit count
    const result = calculateDiscount(
      [{ productId: "prod-1", priceInCents: 999, quantity: 3 }],
      0,
    );

    // Depending on spec intent: average of unit prices = 999
    // Actual result = 2997 / 1 = 2997 (wrong if intent is average unit price)
    // Optinum surfaces this ambiguity as a failing assertion so it requires explicit resolution
    expect(result.averagePriceCents).toBe(999); // FAILS — returns 2997
  });
});
