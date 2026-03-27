// Demonstrates: AI-generated test that PASSES despite the bug
// The AI wrote this test in the same session as the code. It naturally includes
// `currencyCode` in every test payload because that's the context the AI had.
// Every existing caller in the codebase was written BEFORE currencyCode was added
// and does not send it — those callers throw ZodError at runtime. This test
// never discovers that because it never omits the field.

import { createOrder } from "./ai-code";

describe("createOrder", () => {
  it("creates an order with valid input", () => {
    const result = createOrder({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      productId: "prod-123",
      quantity: 2,
      currencyCode: "USD", // AI always includes this — it just wrote the schema
    });

    expect(result.id).toBeDefined();
    expect(result.currencyCode).toBe("USD");
    expect(result.totalCents).toBe(2000);
  });

  it("throws on negative quantity", () => {
    expect(() =>
      createOrder({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        productId: "prod-123",
        quantity: -1,
        currencyCode: "USD", // still included — AI doesn't think to omit it
      }),
    ).toThrow();
  });

  it("throws on invalid uuid", () => {
    expect(() =>
      createOrder({
        userId: "not-a-uuid",
        productId: "prod-123",
        quantity: 1,
        currencyCode: "EUR", // present in all cases
      }),
    ).toThrow();
  });
});
// All 3 tests PASS — test suite is green — bug ships undetected
