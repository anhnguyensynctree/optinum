// Demonstrates: required-field-added (catalog ID: required-field-added)
// AI refactored createOrder to require a `currencyCode` field after adding
// multi-currency support. The function validates with Zod. The unit test the AI
// wrote tests the happy path with a valid payload — it never tests what happens
// when a caller omits the new required field, because the AI wrote both in the
// same session and naturally included the field in every example.

import { z } from "zod";

const CreateOrderSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string(),
  quantity: z.number().int().positive(),
  currencyCode: z.string().length(3), // Added in this AI session for multi-currency
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  currencyCode: string;
  totalCents: number;
  createdAt: Date;
}

export function createOrder(rawInput: unknown): Order {
  const input = CreateOrderSchema.parse(rawInput); // throws ZodError if currencyCode missing

  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    productId: input.productId,
    quantity: input.quantity,
    currencyCode: input.currencyCode,
    totalCents: input.quantity * 1000,
    createdAt: new Date(),
  };
}
