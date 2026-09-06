import { describe, expect, it } from "vitest";
import { fieldConfigSchema, fieldCreateInputSchema, fieldValueSchema, moneyFieldValueSchema } from "@/lib/services/custom-fields/field-contracts";
import { CURRENCY_CODES, MAX_AMOUNT_MINOR } from "@/lib/services/currencies/currency-catalog";

describe("structured field contracts", () => {
  it("accepts all supported currencies and exact nonnegative minor amounts", () => {
    for (const currency of CURRENCY_CODES) for (const amountMinor of [0, MAX_AMOUNT_MINOR]) expect(moneyFieldValueSchema.safeParse({ amountMinor, currency }).success).toBe(true);
    for (const value of [{ amountMinor: -1, currency: "USD" }, { amountMinor: 1.5, currency: "USD" }, { amountMinor: MAX_AMOUNT_MINOR + 1, currency: "USD" }, { amountMinor: 1, currency: "ZZZ" }, { amountMinor: 1, currency: "usd" }, { amountMinor: 1 }, { amountMinor: 1, currency: "USD", extra: true }]) expect(moneyFieldValueSchema.safeParse(value).success).toBe(false);
  });
  it("bounds rating configuration and structured arrays", () => {
    for (const ratingMax of [1, 5, 10]) expect(fieldConfigSchema.safeParse({ ratingMax }).success).toBe(true);
    for (const ratingMax of [0, 11, 2.5]) expect(fieldConfigSchema.safeParse({ ratingMax }).success).toBe(false);
    expect(fieldValueSchema.safeParse(Array.from({ length: 100 }, (_, i) => String(i))).success).toBe(true);
    for (const value of [[""], ["x".repeat(2001)], [1], Array.from({ length: 101 }, (_, i) => String(i))]) expect(fieldValueSchema.safeParse(value).success).toBe(false);
  });
  it("recognizes the five structured types without accepting unimplemented types", () => {
    for (const type of ["money", "multiselect", "multivalue", "rating", "customer"]) expect(fieldCreateInputSchema.safeParse({ entity: "company", label: "Structured", type }).success).toBe(true);
    expect(fieldCreateInputSchema.safeParse({ entity: "company", label: "Unknown", type: "unknown_type" }).success).toBe(false);
  });
});
