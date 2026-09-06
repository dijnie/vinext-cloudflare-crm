import { MAX_AMOUNT_MINOR, minorUnitsOf, type CurrencyCode } from "@/lib/services/currencies/currency-catalog";

export function parseFieldMoneyInput(input: string, currency: CurrencyCode): { valid: true; amountMinor: number | null } | { valid: false } {
  const text = input.trim();
  if (!text) return { valid: true, amountMinor: null };
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return { valid: false };
  const [whole = "", fraction = ""] = text.split(".");
  const places = minorUnitsOf(currency);
  if (fraction.length > places) return { valid: false };
  const digits = `${whole || "0"}${fraction.padEnd(places, "0")}`.replace(/^0+/, "") || "0";
  if (digits.length > String(MAX_AMOUNT_MINOR).length) return { valid: false };
  const amount = BigInt(digits);
  if (amount > BigInt(MAX_AMOUNT_MINOR)) return { valid: false };
  return { valid: true, amountMinor: Number(amount) };
}

export function formatFieldMoneyInput(amountMinor: number, currency: CurrencyCode): string {
  const places = minorUnitsOf(currency);
  const minor = BigInt(amountMinor);
  if (places === 0) return String(minor);
  const factor = 10n ** BigInt(places);
  return `${minor / factor}.${String(minor % factor).padStart(places, "0")}`;
}
