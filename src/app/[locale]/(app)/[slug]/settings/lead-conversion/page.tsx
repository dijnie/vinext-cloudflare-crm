import { notFound } from "next/navigation";
import { LeadMappingSettings } from "@/components/app/settings/lead-mapping-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext(); const initialData = await root.leadMapping.get(context);
  if (!initialData.canManage) notFound(); return <LeadMappingSettings locale={locale} initialData={initialData} />;
}
