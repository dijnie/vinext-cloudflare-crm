import { describe, expect, it } from "vitest";

import { WebhookSecretCrypto } from "@/lib/services/integrations/webhook-secret-crypto";

describe("webhook secret crypto configuration", () => {
  it("rejects an empty configured keyring instead of falling back to auth", () => {
    expect(() => new WebhookSecretCrypto("", "auth-secret-with-at-least-32-characters")).toThrow(
      "WEBHOOK_ENCRYPTION_KEYS must be valid JSON",
    );
  });

  it("keeps the unconfigured fallback in legacy write mode for compatibility tests", async () => {
    const crypto = new WebhookSecretCrypto(undefined, "auth-secret-with-at-least-32-characters");
    expect(await crypto.currentPrefix()).toBeNull();
    expect(await crypto.decrypt(await crypto.encrypt("value"))).toEqual({ value: "value", needsRewrap: false });
  });
});
