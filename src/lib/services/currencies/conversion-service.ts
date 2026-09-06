import { HttpError } from "@/lib/http/http-errors";
import { CURRENCY_CODES, MAX_AMOUNT_MINOR, minorUnitsOf } from "./currency-catalog";
import { rateSchema } from "./currency-contracts";

export type FrozenRate = { rate: string; asOf: string; source: "identity" | "manual" | "fetched" };
export type FrozenRates = Record<string, FrozenRate>;
export function canonicalRate(input: string): string {
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid exchange rate");
  return parsed.data.includes(".") ? parsed.data.replace(/0+$/, "").replace(/\.$/, "") : parsed.data;
}
export function rateMantissa(input: string): bigint { const [whole, fraction = ""] = canonicalRate(input).split("."); return BigInt(whole!) * 10_000_000_000n + BigInt(fraction.padEnd(10, "0")); }
export function convertMinor(amountMinor: number, quoteCurrency: string, baseCurrency: string, rate: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > MAX_AMOUNT_MINOR || !CURRENCY_CODES.some(code => code === quoteCurrency) || !CURRENCY_CODES.some(code => code === baseCurrency)) throw new HttpError(400,"validation_failed","Invalid money input");
  const numerator = BigInt(amountMinor) * rateMantissa(rate) * 10n ** BigInt(minorUnitsOf(baseCurrency));
  const denominator = 10_000_000_000n * 10n ** BigInt(minorUnitsOf(quoteCurrency));
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new HttpError(400, "validation_failed", "Converted amount is too large");
  return Number(rounded);
}
export function conversionFields(amountMinor: number | null, currency: string, baseCurrency: string, rates: FrozenRates) {
  const rate = rates[currency];
  if (amountMinor === null || !rate) return { baseAmountMinor: null, baseCurrency: null, fxRate: null, fxRateAt: null, rateSource: null };
  return { baseAmountMinor: convertMinor(amountMinor, currency, baseCurrency, rate.rate), baseCurrency, fxRate: rate.rate, fxRateAt: new Date(rate.asOf), rateSource: rate.source };
}
