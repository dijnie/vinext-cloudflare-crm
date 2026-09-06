import { notFound } from "next/navigation";
import { DealStageSettings } from "@/components/app/settings/deal-stage-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";
export default async function DealStagesSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const initialData = await root.dealStages.get(context);
  if (!initialData.canManage) notFound();
  return <DealStageSettings locale={locale} initialData={initialData} />;
}
