import { notFound } from "next/navigation";
import { CurrencySettings } from "@/components/app/settings/currency-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";

export default async function CurrenciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  return <CurrencySettings locale={locale} initialData={await root.currency.settings(context)} />;
}
