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
  it("accepts the same-host loopback HTTPS proxy without relaxing remote origins", async () => {
    const proxied = (url: string, origin: string, site = "same-origin") => new Request(url, {
      method: "POST", body: "{}", headers: { origin, "sec-fetch-site": site, "content-type": "application/json" },
    });
    await expect(assertSafeMutationRequest(proxied("http://localhost:8787/api/crm", "http://localhost:8787"), "https://localhost:8787")).resolves.toBeUndefined();
    for (const [url, origin, canonical, site] of [
      ["http://crm.test/api/crm", "http://crm.test", "https://crm.test", "same-origin"],
      ["http://localhost:8787/api/crm", "http://localhost:8788", "https://localhost:8787", "same-origin"],
      ["http://localhost:8787/api/crm", "http://localhost:8787", "https://localhost:8788", "same-origin"],
      ["http://localhost:8787/api/crm", "https://evil.test", "https://localhost:8787", "same-origin"],
      ["http://localhost:8787/api/crm", "http://localhost:8787", "https://localhost:8787", "cross-site"],
    ]) await expect(assertSafeMutationRequest(proxied(url!, origin!, site!), canonical!)).rejects.toMatchObject({ code: "invalid_origin" });
  });
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
