import { notFound } from "next/navigation";
import { LeadSettings } from "@/components/app/settings/lead-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";
export default async function LeadSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const initialData = await root.leadSettings.get(context);
  if (!initialData.canManage) notFound();
  return <LeadSettings locale={locale} initialData={initialData} />;
}
