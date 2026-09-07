const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("Webhook secret ciphertext is invalid");
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
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(secret))).slice(0, 16);
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
  if (!iv || !cipher || extra) throw new Error("Webhook secret ciphertext is invalid");
  return decoder.decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(iv) },
      await key(secret),
      fromHex(cipher),
    ),
  );
}

type Keyring = { current: string; previous?: string[]; write?: "legacy" | "v1" };

function parseKeyring(raw: string | undefined, legacySecret: string): Required<Keyring> {
  if (raw === undefined) return { current: legacySecret, previous: [], write: "legacy" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("WEBHOOK_ENCRYPTION_KEYS must be valid JSON");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Keyring).current !== "string" ||
    (parsed as Keyring).current.length < 32 ||
    ((parsed as Keyring).write !== undefined && !["legacy", "v1"].includes((parsed as Keyring).write!)) ||
    ((parsed as Keyring).previous !== undefined &&
      (!Array.isArray((parsed as Keyring).previous) ||
        (parsed as Keyring).previous!.length > 5 ||
        (parsed as Keyring).previous!.some((item) => typeof item !== "string" || item.length < 32)))
  ) {
    throw new Error("WEBHOOK_ENCRYPTION_KEYS must contain a current key and up to five previous keys of at least 32 characters");
  }
  return {
    current: (parsed as Keyring).current,
    previous: [...new Set((parsed as Keyring).previous ?? [])].filter(
      (item) => item !== (parsed as Keyring).current,
    ),
    write: (parsed as Keyring).write ?? "legacy",
  };
}

export class WebhookSecretCrypto {
  private readonly keys: Required<Keyring>;

  constructor(rawKeyring: string | undefined, private readonly legacySecret: string) {
    this.keys = parseKeyring(rawKeyring, legacySecret);
  }

  async encrypt(value: string): Promise<string> {
    if (this.keys.write === "legacy") return seal(this.legacySecret, value);
    return `v1.${await keyId(this.keys.current)}.${await seal(this.keys.current, value)}`;
  }

  async currentPrefix(): Promise<string | null> {
    return this.keys.write === "v1" ? `v1.${await keyId(this.keys.current)}.` : null;
  }

  async decrypt(value: string): Promise<{ value: string; needsRewrap: boolean }> {
    const tagged = /^v1\.([0-9a-f]{16})\.(.+)$/i.exec(value);
    if (tagged) {
      for (const candidate of [this.keys.current, ...this.keys.previous]) {
        if ((await keyId(candidate)) !== tagged[1]) continue;
        try {
          return { value: await open(candidate, tagged[2]!), needsRewrap: this.keys.write === "v1" && candidate !== this.keys.current };
        } catch {
          throw new Error("Webhook secret ciphertext cannot be decrypted");
        }
      }
      throw new Error("Webhook secret encryption key is unavailable");
    }

    for (const candidate of [...new Set([this.legacySecret, this.keys.current, ...this.keys.previous])]) {
      try {
        return { value: await open(candidate, value), needsRewrap: this.keys.write === "v1" };
      } catch {
        // Try the next configured compatibility key without exposing key material.
      }
    }
    throw new Error("Webhook secret ciphertext cannot be decrypted");
  }
}
