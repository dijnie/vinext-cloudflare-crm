import { describe, expect, it } from "vitest";

import { applySecurityHeaders } from "@/lib/http/security-headers";

describe("global proxy security", () => {
  it("adds document security headers", () => {
    const headers = applySecurityHeaders(new Headers());
    expect(headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers.get("strict-transport-security")).toContain(
      "max-age=31536000",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });
});
