import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  assertSafeMutationRequest,
  INPUT_LIMITS,
  parseJsonInput,
} from "@/server/validation";

function request(body: string, headers: HeadersInit = {}) {
  return new Request("https://crm.test/api/crm", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://crm.test", ...headers },
    body,
  });
}

describe("request validation", () => {
  it("rejects cross-origin and cross-site mutations", async () => {
    await expect(
      assertSafeMutationRequest(
        request("{}", { origin: "https://evil.test" }),
        "https://crm.test",
      ),
    ).rejects.toMatchObject({ code: "invalid_origin" });
    await expect(
      assertSafeMutationRequest(
        request("{}", { "sec-fetch-site": "cross-site" }),
        "https://crm.test",
      ),
    ).rejects.toMatchObject({ code: "invalid_origin" });
  });

  it("requires the exact JSON content type", async () => {
    await expect(
      assertSafeMutationRequest(
        request("{}", { "content-type": "application/json; charset=utf-8" }),
        "https://crm.test",
      ),
    ).rejects.toMatchObject({ code: "invalid_content_type" });
  });

  it("rejects oversized and high-cardinality bodies", async () => {
    await expect(
      parseJsonInput(request(JSON.stringify({ value: "x".repeat(INPUT_LIMITS.bodyBytes) })), z.unknown()),
    ).rejects.toMatchObject({ code: "input_limit_exceeded" });
    await expect(
      parseJsonInput(
        request(JSON.stringify(Array.from({ length: INPUT_LIMITS.arrayItems + 1 }, () => 1))),
        z.unknown(),
      ),
    ).rejects.toMatchObject({ code: "input_limit_exceeded" });
  });
});
