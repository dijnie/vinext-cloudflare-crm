import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportDashboard } from "@/components/app/reports/report-dashboard";
import { getPageContext } from "@/lib/http/page-context";
import { isAppLocale } from "@/lib/i18n/config";
import { getReportDictionary } from "@/lib/i18n/report-dictionary";
import { reportInputSchema } from "@/lib/services/reports/report-contracts";

export const dynamic = "force-dynamic";
export default async function ReportsPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, slug } = await params; if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const today = (await root.settings.get(context)).today, first = `${today.slice(0, 8)}01`, query = await searchParams;
  const input = reportInputSchema.safeParse({ from: query.from ?? first, to: query.to ?? today, scope: query.scope ?? "me", scopeId: query.scopeId, source: query.source, recorderUserId: query.recorderUserId });
  if (!input.success) return <div className="space-y-4"><h1>{getReportDictionary(locale).error}</h1><Link className="text-primary underline" href={`/${locale}/${slug}/reports`}>Reset</Link></div>;
  return <ReportDashboard initialData={await root.reports.summary(context, input.data)} locale={locale} />;
}
