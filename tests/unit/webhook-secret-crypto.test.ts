import { describe, expect, it } from "vitest";

import { WebhookSecretCrypto } from "@/lib/services/integrations/webhook-secret-crypto";

const encryptionKey = "ab".repeat(32);
const authSecret = "auth-secret-with-at-least-32-characters";

// Reproduce the stored format independently of the production writer.
async function storedCipher(secret: string, value: string, versioned: boolean) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = new Uint8Array(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value),
  );
  const hex = (bytes: ArrayBuffer) =>
    [...new Uint8Array(bytes)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  return `${versioned ? `v1.${hex(digest).slice(0, 16)}.` : ""}${hex(iv.buffer)}.${hex(cipher)}`;
}

describe("webhook secret crypto configuration", () => {
  it.each([
    "",
    "ab".repeat(16),
    "ab".repeat(33),
    "zz".repeat(32),
    JSON.stringify({ current: encryptionKey }),
  ])("rejects invalid key format %#", (value) => {
    expect(() => new WebhookSecretCrypto(value, authSecret)).toThrow(
      "WEBHOOK_ENCRYPTION_KEY must be 64 hexadecimal characters",
    );
  });

  it("rejects a missing key without falling back to auth", () => {
    expect(
      () => new WebhookSecretCrypto(undefined as unknown as string, authSecret),
    ).toThrow("WEBHOOK_ENCRYPTION_KEY must be 64 hexadecimal characters");
  });

  it("encrypts with a dedicated hex key independently of auth", async () => {
    const secrets = new WebhookSecretCrypto(encryptionKey, authSecret);
    const first = await secrets.encrypt("value");
    expect(first).toMatch(/^v1\.[0-9a-f]{16}\./);
    expect(await secrets.encrypt("value")).not.toBe(first);
    const rotatedAuth = new WebhookSecretCrypto(
      encryptionKey,
      "changed-auth-secret",
    );
    expect(await rotatedAuth.decrypt(first)).toEqual({
      value: "value",
      needsRewrap: false,
    });
  });

  it("reads existing versioned records without changing the key derivation", async () => {
    const secrets = new WebhookSecretCrypto(encryptionKey, authSecret);
    expect(
      await secrets.decrypt(
        await storedCipher(encryptionKey, "existing", true),
      ),
    ).toEqual({ value: "existing", needsRewrap: false });
  });

  it("accepts uppercase hex and preserves the existing key spelling", async () => {
    const upper = encryptionKey.toUpperCase();
    const secrets = new WebhookSecretCrypto(upper, authSecret);
    expect(
      await secrets.decrypt(await storedCipher(upper, "existing", true)),
    ).toEqual({ value: "existing", needsRewrap: false });
  });

  it("marks legacy auth-encrypted records for re-encryption", async () => {
    const secrets = new WebhookSecretCrypto(encryptionKey, authSecret);
    expect(
      await secrets.decrypt(await storedCipher(authSecret, "existing", false)),
    ).toEqual({ value: "existing", needsRewrap: true });
  });

  it("rejects records encrypted with another key", async () => {
    const secrets = new WebhookSecretCrypto(encryptionKey, authSecret);
    await expect(
      secrets.decrypt(await storedCipher("cd".repeat(32), "existing", true)),
    ).rejects.toThrow("encryption key is unavailable");
  });

  it("rejects tampered ciphertext", async () => {
    const secrets = new WebhookSecretCrypto(encryptionKey, authSecret);
    const sealed = await secrets.encrypt("value");
    const tampered =
      sealed.slice(0, -2) + (sealed.endsWith("00") ? "01" : "00");
    await expect(secrets.decrypt(tampered)).rejects.toThrow(
      "cannot be decrypted",
    );
  });
});
