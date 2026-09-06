import type { AppLocale } from "@/lib/i18n/config";
import { formatMinor, minorUnitsOf } from "@/lib/services/currencies/currency-catalog";

export function CompactMoney({ value, currency, locale }: { value: string | number | null; currency: string; locale: AppLocale }) {
  if (value === null) return <>—</>;
  const minor = BigInt(value); const factor = 10n ** BigInt(minorUnitsOf(currency));
  const whole = minor / factor;
  const compactValue = whole < 1000n && whole > -1000n ? Number(minor) / Number(factor) : whole;
  const compact = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(compactValue);
  const exact = formatMinor(value, currency, locale);
  return <span title={exact} aria-label={exact}>{compact}</span>;
}
