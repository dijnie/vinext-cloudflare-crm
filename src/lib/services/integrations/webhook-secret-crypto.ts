const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value))
    throw new Error("Webhook secret ciphertext is invalid");
  const result = new Uint8Array(new ArrayBuffer(value.length / 2));
  for (let index = 0; index < result.length; index++) {
    result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

async function keyId(secret: string): Promise<string> {
  return hex(
    await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ).slice(0, 16);
}

async function seal(secret: string, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    encoder.encode(value),
  );
  return `${hex(iv.buffer)}.${hex(cipher)}`;
}

async function open(secret: string, value: string): Promise<string> {
  const [iv, cipher, extra] = value.split(".");
  if (!iv || !cipher || extra)
    throw new Error("Webhook secret ciphertext is invalid");
  return decoder.decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(iv) },
      await key(secret),
      fromHex(cipher),
    ),
  );
}

export class WebhookSecretCrypto {
  constructor(
    private readonly encryptionKey: string,
    private readonly legacySecret: string,
  ) {
    if (
      typeof encryptionKey !== "string" ||
      !/^[0-9a-f]{64}$/i.test(encryptionKey)
    ) {
      throw new Error(
        "WEBHOOK_ENCRYPTION_KEY must be 64 hexadecimal characters",
      );
    }
  }

  async encrypt(value: string): Promise<string> {
    return `${await this.currentPrefix()}${await seal(this.encryptionKey, value)}`;
  }

  async currentPrefix(): Promise<string> {
    return `v1.${await keyId(this.encryptionKey)}.`;
  }

  async decrypt(
    value: string,
  ): Promise<{ value: string; needsRewrap: boolean }> {
    const tagged = /^v1\.([0-9a-f]{16})\.(.+)$/i.exec(value);
    if (tagged) {
      if ((await keyId(this.encryptionKey)) !== tagged[1]) {
        throw new Error("Webhook secret encryption key is unavailable");
      }
      try {
        return {
          value: await open(this.encryptionKey, tagged[2]!),
          needsRewrap: false,
        };
      } catch {
        throw new Error("Webhook secret ciphertext cannot be decrypted");
      }
    }

    // Read existing untagged records so they can be re-encrypted with the dedicated key.
    for (const candidate of [this.legacySecret, this.encryptionKey]) {
      try {
        return { value: await open(candidate, value), needsRewrap: true };
      } catch {
        // Compatibility reads never expose key material.
      }
    }
    throw new Error("Webhook secret ciphertext cannot be decrypted");
  }
}
