const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EligibilityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EligibilityConfigurationError";
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseEmailAllowlist(
  value: string | undefined,
): ReadonlySet<string> {
  if (!value?.trim()) {
    throw new EligibilityConfigurationError("AUTH_ALLOWED_EMAILS is required");
  }

  const emails = value.split(",").map(normalizeEmail);
  if (emails.some((email) => !EMAIL_PATTERN.test(email))) {
    throw new EligibilityConfigurationError("AUTH_ALLOWED_EMAILS is malformed");
  }

  return new Set(emails);
}

export function isEmailEligible(
  email: string,
  allowlist: ReadonlySet<string>,
): boolean {
  return allowlist.has(normalizeEmail(email));
}
