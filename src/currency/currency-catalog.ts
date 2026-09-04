export const CURRENCY_CODES = ["USD", "EUR", "JPY", "GBP", "CNY", "AUD", "CAD", "CHF", "HKD", "SGD", "ZAR"] as const;
export type CurrencyCode = typeof CURRENCY_CODES[number];
export const CURRENCIES = CURRENCY_CODES.map(code => ({ code, minorUnits: code === "JPY" ? 0 as const : 2 as const }));
export function minorUnitsOf(code: string): 0 | 2 { return code === "JPY" ? 0 : 2; }
export const MAX_AMOUNT_MINOR = 99_999_999_999_999;
export function formatMinor(value: string | number | bigint, currency: string, locale: string): string {
  const minor = BigInt(value), places = minorUnitsOf(currency), factor = 10n ** BigInt(places);
  const fraction = (minor < 0n ? -minor : minor) % factor;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: places, maximumFractionDigits: places }).formatToParts(minor / factor).map(part => part.type === "fraction" ? fraction.toString().padStart(places, "0") : part.value).join("");
}
