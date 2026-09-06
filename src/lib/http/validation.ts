import type { ZodType } from "zod";

import { HttpError } from "./http-errors";

export const INPUT_LIMITS = {
  bodyBytes: 64 * 1024,
  arrayItems: 200,
  objectKeys: 100,
  depth: 12,
} as const;

function assertValueLimits(value: unknown, depth = 0): void {
  if (depth > INPUT_LIMITS.depth) {
    throw new HttpError(413, "input_limit_exceeded", "Input nesting is too deep");
  }
  if (Array.isArray(value)) {
    if (value.length > INPUT_LIMITS.arrayItems) {
      throw new HttpError(413, "input_limit_exceeded", "Input has too many items");
    }
    for (const item of value) assertValueLimits(item, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > INPUT_LIMITS.objectKeys) {
      throw new HttpError(413, "input_limit_exceeded", "Input has too many fields");
    }
    for (const [, item] of entries) assertValueLimits(item, depth + 1);
  }
}

export function assertSafeMutationOrigin(
  request: Request,
  canonicalOrigin: string,
): void {
  let origin = request.headers.get("origin");
  const incoming = new URL(request.url);
  const canonical = new URL(canonicalOrigin);
  // The local HTTPS proxy forwards same-origin requests to its HTTP Worker.
  // Never relax canonical-origin checks for a non-loopback deployment.
  if (
    ["localhost", "127.0.0.1", "[::1]"].includes(incoming.hostname) &&
    incoming.protocol === "http:" && canonical.protocol === "https:" &&
    incoming.host === canonical.host && origin === incoming.origin
  ) origin = canonicalOrigin;
  const fetchSite = request.headers.get("sec-fetch-site");
  const acceptedSites = ["same-origin", "same-site", "none"];
  if (origin !== canonicalOrigin || (fetchSite && !acceptedSites.includes(fetchSite))) {
    throw new HttpError(403, "invalid_origin", "The request origin is not allowed");
  }
}

export async function assertSafeMutationRequest(request: Request, canonicalOrigin: string): Promise<void> {
  assertSafeMutationOrigin(request, canonicalOrigin);
  if (request.headers.get("content-type") !== "application/json") {
    throw new HttpError(415, "invalid_content_type", "Content-Type must be application/json");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > INPUT_LIMITS.bodyBytes) {
    throw new HttpError(413, "input_limit_exceeded", "Request body is too large");
  }
  const actualBytes = (await request.clone().arrayBuffer()).byteLength;
  if (actualBytes > INPUT_LIMITS.bodyBytes) {
    throw new HttpError(413, "input_limit_exceeded", "Request body is too large");
  }
}

export async function parseJsonInput<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > INPUT_LIMITS.bodyBytes) {
    throw new HttpError(413, "input_limit_exceeded", "Request body is too large");
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must contain valid JSON");
  }
  assertValueLimits(value);
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "validation_failed", "Request input is invalid");
  }
  return parsed.data;
}
