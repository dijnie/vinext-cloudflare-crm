import { describe, expect, it } from "vitest";
import { FIELD_TYPES, fieldCreateInputSchema, fieldDeleteInputSchema, fieldKeyFromLabel, fieldReorderInputSchema, fieldValuesInputSchema } from "@/lib/services/custom-fields/field-contracts";

describe("custom field contracts", () => {
  it("accepts all supported field types on all three entities with stable defaults", () => {
    expect(FIELD_TYPES).toEqual(["text", "long_text", "number", "date", "checkbox", "select", "url", "email", "phone", "user", "money", "multiselect", "multivalue", "rating", "customer", "formula", "file"]);
    for (const entity of ["company", "contact", "deal"]) for (const type of FIELD_TYPES) {
      expect(fieldCreateInputSchema.parse({ entity, type, label: "  Customer field  " })).toMatchObject({ entity, type, label: "Customer field", required: false, showOnSheet: true });
    }
  });
  it("rejects unknown definitions, nested values, non-finite numbers and oversized writes", () => {
    for (const input of [{ entity: "task", type: "text", label: "x" }, { entity: "company", type: "json", label: "x" }, { entity: "company", type: "text", label: "x", workspaceId: "other" }]) expect(fieldCreateInputSchema.safeParse(input).success).toBe(false);
    for (const raw of [{ nested: true }, [1], NaN, Infinity]) expect(fieldValuesInputSchema.safeParse({ entity: "company", recordId: "x", values: { field: raw } }).success).toBe(false);
    expect(fieldValuesInputSchema.safeParse({ entity: "company", recordId: "x", values: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`f${i}`, i])) }).success).toBe(false);
    expect(fieldValuesInputSchema.parse({ entity: "contact", recordId: "x", values: { number: 1.25, zero: 0, false: false, empty: null } }).values).toEqual({ number: 1.25, zero: 0, false: false, empty: null });
  });
  it("normalizes keys and requires distinct reorder IDs and explicit delete confirmations", () => {
    expect(fieldKeyFromLabel("Đánh giá khách hàng")).toBe("danh_gia_khach_hang");
    expect(fieldKeyFromLabel("2026 rating")).toBe("f_2026_rating");
    expect(fieldKeyFromLabel("constructor")).not.toBe("constructor");
    expect(fieldReorderInputSchema.safeParse({ entity: "company", ids: ["one", "one"] }).success).toBe(false);
    expect(fieldDeleteInputSchema.safeParse({ confirmation: "key" }).success).toBe(false);
    expect(fieldDeleteInputSchema.safeParse({ password: "password" }).success).toBe(false);
  });
});
