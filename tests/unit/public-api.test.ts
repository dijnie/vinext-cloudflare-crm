import { describe, expect, it, vi } from "vitest";
import type { CompositionRoot } from "@/lib/composition-root";
import { handleIntegrationRequest } from "@/lib/http/integration-api-handler";
import { publicApiDocument } from "@/lib/openapi/public-api-document";

describe("public API contract", () => {
  it("documents only approved versioned integration and public paths", () => {
    expect(Object.keys(publicApiDocument.paths)).toEqual([
      "/api/integrations/v1/contacts",
      "/api/integrations/v1/leads",
      "/api/integrations/v1/tickets",
      "/api/integrations/v1/events",
      "/api/public/webforms/{slug}",
    ]);
    expect(JSON.stringify(publicApiDocument)).not.toContain("/api/crm/");
    expect(
      publicApiDocument.components.securitySchemes.integrationBearer,
    ).toMatchObject({ type: "http", scheme: "bearer" });
  });
  it("matches bounded runtime request contracts", () => {
    expect(
      publicApiDocument.components.schemas.CreateLead.properties.sourceId,
    ).toMatchObject({ minLength: 1, maxLength: 80 });
    expect(
      publicApiDocument.components.schemas.CreateTicket.properties.source,
    ).toMatchObject({ minLength: 1, maxLength: 120 });
    expect(
      publicApiDocument.components.schemas.WebformSubmission,
    ).toMatchObject({
      maxProperties: 50,
      propertyNames: { minLength: 1, maxLength: 80 },
    });
    expect(
      publicApiDocument.paths["/api/integrations/v1/leads"].post.responses,
    ).toHaveProperty("413");
    expect(
      publicApiDocument.paths["/api/integrations/v1/tickets"].post.responses,
    ).toHaveProperty("413");
  });
  it("accepts new and legacy credential formats and shares their stable digest with the limiter", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true }),
      securityLogger = vi.fn(),
      root = {
        env: { INTEGRATION_RATE_LIMITER: { limit } },
        securityLogger,
      } as unknown as CompositionRoot,
      action = vi.fn(async () => ({ ok: true })),
      newToken = "a".repeat(32),
      legacyToken = `crm_${"b".repeat(64)}`;
    for (const [scheme, token] of [
      ["Bearer", newToken],
      ["bearer", newToken],
      ["Bearer", legacyToken],
    ]) {
      const response = await handleIntegrationRequest(
        root,
        new Request("https://crm.test/api/integrations/v1/contacts", {
          headers: { authorization: `${scheme} ${token}` },
        }),
        action,
      );
      expect(response.status).toBe(200);
    }
    expect(limit).toHaveBeenCalledTimes(3);
    const keys = limit.mock.calls.map((call) => call[0].key);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
    expect(securityLogger).not.toHaveBeenCalled();
  });
  it("rejects malformed credentials before execution and returns Retry-After when limited", async () => {
    const action = vi.fn(async () => ({ ok: true })),
      securityLogger = vi.fn(),
      invalidRoot = { env: {}, securityLogger } as unknown as CompositionRoot,
      invalid = await handleIntegrationRequest(
        invalidRoot,
        new Request("https://crm.test/api/integrations/v1/leads", {
          headers: { authorization: "Bearer short" },
        }),
        action,
      );
    expect(invalid.status).toBe(401);
    expect(action).not.toHaveBeenCalled();
    const limitedRoot = {
        env: {
          INTEGRATION_RATE_LIMITER: {
            limit: vi.fn().mockResolvedValue({ success: false }),
          },
        },
        securityLogger,
      } as unknown as CompositionRoot,
      limited = await handleIntegrationRequest(
        limitedRoot,
        new Request("https://crm.test/api/integrations/leads", {
          headers: { authorization: `Bearer ${"c".repeat(32)}` },
        }),
        action,
      );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(action).not.toHaveBeenCalled();
  });
});
