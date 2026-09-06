import { notFound } from "next/navigation";
import { LayoutSettings } from "@/components/app/settings/layout-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";
export default async function LayoutSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const initialData = await Promise.all((["company", "contact", "deal"] as const).map(entity => root.layouts.get(context, { entity })));
  if (!initialData.every(item => item.canManage)) notFound();
  return <LayoutSettings locale={locale} initialData={initialData} />;
}
