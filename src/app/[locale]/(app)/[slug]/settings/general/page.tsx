import { notFound } from "next/navigation";
import { BusinessSettings } from "@/components/app/settings/business-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";

export default async function GeneralSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  return <BusinessSettings locale={locale} initialData={await root.settings.get(context)} />;
}
