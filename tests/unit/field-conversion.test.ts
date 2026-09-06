import { describe, expect, it } from "vitest";
import { FIELD_TYPES, type FieldType } from "@/lib/services/custom-fields/field-contracts";
import { conversionRejection, supportsConversion } from "@/lib/services/custom-fields/field-conversion-values";
import { conversionInputSchema } from "@/lib/services/custom-fields/field-conversion-contracts";

describe("lossless field conversion contracts", () => {
  it("supports only the accepted pair matrix, including null preservation", () => {
    const text: FieldType[] = ["text", "long_text", "email", "phone", "url"];
    const pairs = new Set([...text.flatMap(source => [...text.filter(target => target !== source), "multivalue"].map(target => `${source}:${target}`)), ...text.map(target => `multivalue:${target}`), "number:rating", "rating:number", "select:multiselect", "multiselect:select"]);
    for (const source of FIELD_TYPES) for (const target of FIELD_TYPES) {
      expect(supportsConversion(source, target), `${source}:${target}`).toBe(pairs.has(`${source}:${target}`));
      if (pairs.has(`${source}:${target}`)) expect(conversionRejection(source, target, {}, null)).toBeNull();
    }
  });
  it("never joins arrays, discards empty arrays or rounds ratings", () => {
    expect(conversionRejection("multivalue", "text", {}, [])).toBe("empty_array");
    expect(conversionRejection("multiselect", "select", {}, ["a", "b"])).toBe("multiple_values");
    expect(conversionRejection("multivalue", "text", {}, ["Exact value"])).toBeNull();
    for (const value of [-1, 2.5, 6]) expect(conversionRejection("number", "rating", {}, value)).toBe("invalid_target_value");
    expect(conversionRejection("number", "rating", { ratingMax: 10 }, 10)).toBeNull();
    expect(conversionRejection("number", "rating", {}, 0)).toBeNull();
  });
  it("rejects target email and URL violations and normalization loss", () => {
    expect(conversionRejection("text", "email", {}, "person@example.com")).toBeNull();
    for (const value of ["not email", "person@example"]) expect(conversionRejection("text", "email", {}, value)).toBe("invalid_target_value");
    for (const value of ["javascript:alert(1)", "not a url"]) expect(conversionRejection("text", "url", {}, value)).toBe("invalid_target_value");
    expect(conversionRejection("text", "url", {}, "https://example.com/path?q=1")).toBeNull();
    for (const value of [" spaced ", "x".repeat(2001)]) expect(conversionRejection("text", "multivalue", {}, value)).toBe("invalid_target_value");
  });
  it("keeps apply server-token based and rejects caller-supplied snapshot fields", () => {
    expect(conversionInputSchema.safeParse({ action: "apply", token: crypto.randomUUID() }).success).toBe(true);
    for (const input of [{ action: "apply", token: "bad" }, { action: "apply", token: crypto.randomUUID(), type: "text" }, { action: "preview", type: "text", userId: "other" }]) expect(conversionInputSchema.safeParse(input).success).toBe(false);
  });
});
