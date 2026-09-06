import { notFound } from "next/navigation";
import { AccessSettings } from "@/components/app/settings/access-settings";
import { isAppLocale } from "@/lib/i18n/config";
import { getPageContext } from "@/lib/http/page-context";

export default async function AccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  if (context.role !== "owner") notFound();
  return <AccessSettings locale={locale} initialData={await root.access.settings(context)} />;
}
