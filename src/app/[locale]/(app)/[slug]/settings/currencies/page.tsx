import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CurrencySettings } from "@/components/settings/currency-settings";
import { isAppLocale } from "@/i18n/config";
import { createCompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { requireRequestContext } from "@/server/request-context";

export default async function CurrenciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const root = createCompositionRoot(env as RuntimeEnv);
  const context = await requireRequestContext(new Headers(await headers()), root);
  return <CurrencySettings locale={locale} initialData={await root.currency.settings(context)} />;
}
