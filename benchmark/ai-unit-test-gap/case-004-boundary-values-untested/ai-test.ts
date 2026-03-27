// Demonstrates: AI-generated test that PASSES despite boundary bugs
// AI tests only the exact inputs from its own docstring examples.
// All inputs use non-empty arrays and valid discount percentages (0-100).
// The empty-array NaN bug and the >100% discount bug are never exercised.
// Line coverage appears complete. Both bugs ship undetected.

import { calculateDiscount } from "./ai-code";

describe("calculateDiscount", () => {
  it("applies 10% discount to a two-item cart", () => {
    const result = calculateDiscount(
      [
        { productId: "prod-1", priceInCents: 1000, quantity: 2 },
        { productId: "prod-2", priceInCents: 500, quantity: 1 },
      ],
      10,
    );

    expect(result.originalTotalCents).toBe(2500);
    expect(result.discountAmountCents).toBe(250);
    expect(result.finalTotalCents).toBe(2250);
    expect(result.averagePriceCents).toBe(1250); // 2500 / 2 — only 2 items in length
  });

  it("applies 0% discount (no change)", () => {
    const result = calculateDiscount(
      [{ productId: "prod-1", priceInCents: 1000, quantity: 1 }],
      0,
    );

    expect(result.discountAmountCents).toBe(0);
    expect(result.finalTotalCents).toBe(1000);
  });

  it("applies 100% discount (full discount)", () => {
    const result = calculateDiscount(
      [{ productId: "prod-1", priceInCents: 500, quantity: 2 }],
      100,
    );

    expect(result.finalTotalCents).toBe(0);
  });
});
// All 3 tests PASS — no empty array, no >100% discount tested — both bugs ship
