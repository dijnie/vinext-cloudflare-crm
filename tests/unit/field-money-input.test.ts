import { describe, expect, it } from "vitest";
import { formatFieldMoneyInput, parseFieldMoneyInput } from "../../src/components/app/fields/field-money-input";
import { MAX_AMOUNT_MINOR } from "../../src/lib/services/currencies/currency-catalog";

describe("custom money amount conversion", () => {
  it("converts decimal text exactly without floating point rounding", () => {
    expect(parseFieldMoneyInput("12.34", "USD")).toEqual({ valid: true, amountMinor: 1234 });
    expect(parseFieldMoneyInput("0.29", "USD")).toEqual({ valid: true, amountMinor: 29 });
    expect(parseFieldMoneyInput(".05", "EUR")).toEqual({ valid: true, amountMinor: 5 });
    expect(parseFieldMoneyInput("1234", "VND")).toEqual({ valid: true, amountMinor: 1234 });
    expect(parseFieldMoneyInput("", "USD")).toEqual({ valid: true, amountMinor: null });
    expect(parseFieldMoneyInput("0", "USD")).toEqual({ valid: true, amountMinor: 0 });
  });
  it("rejects precision loss, negative values, exponents and overflow", () => {
    for (const value of ["12.345", "1e3", "-1", "NaN", "1,25", "1000000000000.00"]) expect(parseFieldMoneyInput(value, "USD")).toEqual({ valid: false });
    expect(parseFieldMoneyInput("1234.5", "VND")).toEqual({ valid: false });
    expect(parseFieldMoneyInput("999999999999.99", "USD")).toEqual({ valid: true, amountMinor: MAX_AMOUNT_MINOR });
    expect(parseFieldMoneyInput("99999999999999", "JPY")).toEqual({ valid: true, amountMinor: MAX_AMOUNT_MINOR });
  });
  it("retains the numeric amount on currency change and validates the target precision", () => {
    expect(parseFieldMoneyInput("1234", "USD")).toEqual({ valid: true, amountMinor: 123400 });
    expect(parseFieldMoneyInput("1234", "VND")).toEqual({ valid: true, amountMinor: 1234 });
    expect(parseFieldMoneyInput("12.34", "JPY")).toEqual({ valid: false });
    expect(formatFieldMoneyInput(1234, "USD")).toBe("12.34");
    expect(formatFieldMoneyInput(1234, "VND")).toBe("1234");
    expect(formatFieldMoneyInput(MAX_AMOUNT_MINOR, "USD")).toBe("999999999999.99");
  });
});
