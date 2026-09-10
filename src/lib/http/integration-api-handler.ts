import type { CompositionRoot } from "@/lib/composition-root";
import { HttpError, isHttpError } from "@/lib/http/http-errors";
import { applySecurityHeaders } from "@/lib/http/security-headers";

const keyPattern = /^(?:[0-9a-f]{32}|crm_[0-9a-f]{64})$/;

async function credentialDigest(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function integrationReply(body: unknown, status = 200) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": "application/json",
  });
  if (status === 429) headers.set("retry-after", "60");
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleIntegrationRequest(
  root: CompositionRoot,
  request: Request,
  action: (token: string) => Promise<unknown>,
) {
  const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
  try {
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.get("authorization") ?? "",
    );
    const token = match?.[1] ?? "";
    if (!keyPattern.test(token))
      throw new HttpError(
        401,
        "authentication_required",
        "A valid app token is required",
      );
    const limiter = root["env"]["INTEGRATION_RATE_LIMITER"];
    if (
      limiter &&
      !(await limiter.limit({ key: await credentialDigest(token) })).success
    )
      throw new HttpError(
        429,
        "rate_limited",
        "Integration request limit exceeded",
      );
    return integrationReply(await action(token));
  } catch (error) {
    const status = isHttpError(error)
      ? error.status
      : error instanceof Error && error.name === "ZodError"
        ? 400
        : 500;
    const code = isHttpError(error)
      ? error.code
      : status === 400
        ? "validation_failed"
        : "internal_error";
    root.securityLogger({
      code,
      requestId,
      method: request.method,
      outcome: status < 500 ? "rejected" : "failed",
    });
    return integrationReply({ error: { code, requestId } }, status);
  }
}
