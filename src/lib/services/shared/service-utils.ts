import { HttpError } from "@/lib/http/http-errors";

export function blankToNull(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeDomain(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const host = new URL(candidate).hostname.replace(/^www\./, "");
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return host;
  } catch {}
  throw new HttpError(400, "validation_failed", "Domain is invalid");
}

export function normalizeEmail(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function relationError(error: unknown, fallback: string): never {
  const messages: string[] = [];
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error) messages.push(current.message);
    current = "cause" in current ? current.cause : null;
  }
  const message = messages.join(" ").toLowerCase();
  if (message.includes("saved_view_owner_inactive")) {
    throw new HttpError(403, "membership_required", "Active membership is required");
  }
  if (
    message.includes("activity anchor mismatch") ||
    message.includes("deal contact company mismatch") ||
    message.includes("contact company conflicts with a deal") ||
    message.includes("deal company conflicts with a contact")
  ) {
    throw new HttpError(409, "conflict", fallback);
  }
  if (message.includes("deal company and owner are required")) {
    throw new HttpError(
      400,
      "validation_failed",
      "Deal company and owner are required",
    );
  }
  if (message.includes("unique constraint failed")) {
    throw new HttpError(409, "conflict", fallback);
  }
  if (
    message.includes("foreign key constraint failed") ||
    message.includes("membership is inactive")
  ) {
    throw new HttpError(400, "validation_failed", "A relationship is invalid");
  }
  throw error;
}
