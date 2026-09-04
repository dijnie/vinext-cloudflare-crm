import { describe, expect, it } from "vitest";

import {
  EligibilityConfigurationError,
  isEmailEligible,
  normalizeEmail,
  parseEmailAllowlist,
} from "@/auth/signup-eligibility";

describe("sign-up eligibility", () => {
  it("normalizes whitespace and case before exact matching", () => {
    const allowlist = parseEmailAllowlist(
      " Owner@Example.com , member@example.com ",
    );

    expect(normalizeEmail(" OWNER@EXAMPLE.COM ")).toBe("owner@example.com");
    expect(isEmailEligible(" OWNER@EXAMPLE.COM ", allowlist)).toBe(true);
    expect(isEmailEligible("owner+other@example.com", allowlist)).toBe(false);
    expect(isEmailEligible("owner@example.co", allowlist)).toBe(false);
  });

  it.each([undefined, "", "   ", "valid@example.com,not-an-email"])(
    "fails closed for invalid configuration: %s",
    (value) => {
      expect(() => parseEmailAllowlist(value)).toThrow(
        EligibilityConfigurationError,
      );
    },
  );
});
