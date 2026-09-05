import { notFound } from "next/navigation";
import { CurrencySettings } from "@/components/settings/currency-settings";
import { isAppLocale } from "@/i18n/config";
import { getPageContext } from "@/server/page-context";

export default async function CurrenciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  return <CurrencySettings locale={locale} initialData={await root.currency.settings(context)} />;
}
