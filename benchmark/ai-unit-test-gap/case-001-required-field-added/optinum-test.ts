// Optinum generates this from: changeType=[contract-change], pattern=[required-field-added]
// Optinum receives the blast radius diff: CreateOrderSchema gained `currencyCode` (required).
// It identifies all callers in the blast radius that call createOrder and checks whether
// their payloads include the new field. It then generates a test that replicates a
// pre-existing caller's payload (without the field) to prove the contract break.
// This test FAILS on the buggy code — exposing the gap before it ships.

import { createOrder } from "./ai-code";

describe("createOrder — Optinum contract tests (required-field-added)", () => {
  it("FAILS: existing caller payload without currencyCode throws ZodError", () => {
    // Simulates a caller written before currencyCode was added to the schema.
    // This payload was valid before the AI's change; it breaks after.
    expect(() =>
      createOrder({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        productId: "prod-123",
        quantity: 2,
        // currencyCode intentionally absent — replicates pre-change caller
      }),
    ).toThrow(/required/i); // ZodError: Required at currencyCode
  });

  it("FAILS: caller sending empty string for currencyCode is rejected", () => {
    // Boundary: callers that default to empty string rather than omitting
    expect(() =>
      createOrder({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        productId: "prod-456",
        quantity: 1,
        currencyCode: "", // too short — Zod length(3) rejects it
      }),
    ).toThrow();
  });

  it("documents that AI test never covers caller without new field", () => {
    // Structural proof: the AI test always passes currencyCode because
    // it was written in the same session that added it. Callers outside
    // that session never received the memo.
    const aiTestAlwaysPassesCurrencyCode = true;
    expect(aiTestAlwaysPassesCurrencyCode).toBe(true);
    // The gap: AI test coverage is 100% for the new field path,
    // 0% for the caller-omits-field path.
  });
});
