import { notFound } from "next/navigation";
import { ModuleSettings } from "@/components/app/settings/module-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";
export default async function ModulesSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const initialData = await root.modules.get(context);
  if (!initialData.canManage) notFound();
  return <ModuleSettings locale={locale} initialData={initialData} />;
}
