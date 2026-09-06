import { notFound } from "next/navigation";
import { CatalogSettings } from "@/components/app/settings/catalog-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";
export default async function CatalogSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const initialData = await root.productCategories.get(context);
  if (!initialData.canManage) notFound();
  return <CatalogSettings locale={locale} initialData={initialData} />;
}
