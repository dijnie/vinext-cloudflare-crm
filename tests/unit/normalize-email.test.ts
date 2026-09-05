import { describe, expect, it } from "vitest";

import { normalizeEmail } from "@/modules/auth/normalize-email";

describe("email normalization", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeEmail(" OWNER@EXAMPLE.COM ")).toBe("owner@example.com");
  });
});
