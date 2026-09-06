import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardSummary } from "@/components/app/dashboard/dashboard-summary";
import { dashboardInputSchema } from "@/lib/services/dashboard/dashboard-contracts";
import { isAppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getPageContext } from "@/lib/http/page-context";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const query = await searchParams;
  // Record-sheet parameters belong to the shared shell, not dashboard scope.
  const input = dashboardInputSchema.safeParse({ scope: query.scope });
  if (!input.success) {
    const labels = getCrmDictionary(locale);
    return <div className="space-y-4"><h1>{labels.invalidQuery}</h1><Link className="text-primary underline" href={`/${locale}/${slug}`}>{labels.reset}</Link></div>;
  }
  return <DashboardSummary initialData={await root.dashboard.summary(context, input.data)} locale={locale} />;
}
