"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RecordLink } from "@/components/app/record-sheet/record-link";
import { crmRequest } from "@/components/app/record-types";
import { pushListQuery } from "@/components/app/list-navigation";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { formatMinor } from "@/lib/services/currencies/currency-catalog";
import type { DashboardSummaryData } from "@/lib/services/dashboard/dashboard-contracts";
import type { AppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getCurrencyDictionary } from "@/lib/i18n/currency-dictionary";
import { getShellInterfaceDictionary } from "@/lib/i18n/shell-interface-dictionary";
import { NavigationSkeleton } from "../navigation-skeleton";
import { CompactMoney } from "./compact-money";
import { PipelineDonut, SalesTrend, stageColors } from "./dashboard-charts";

function DashboardPanel({ title, description, action, children, fixed = false }: { title: string; description?: string; action?: ReactNode; children: ReactNode; fixed?: boolean }) {
  return <Card className="min-w-0"><CardHeader><CardTitle><h2>{title}</h2></CardTitle>{description && <CardDescription>{description}</CardDescription>}{action && <CardAction>{action}</CardAction>}</CardHeader><div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card ${fixed ? "h-80 flex-none" : ""}`}>{children}</div></Card>;
}

export function DashboardSummary({ initialData, locale }: { initialData: DashboardSummaryData; locale: AppLocale }) {
  const labels = getCurrencyDictionary(locale); const crm = getCrmDictionary(locale); const copy = getShellInterfaceDictionary(locale);
  const pathname = usePathname(); const search = useSearchParams();
  const scope = search.get("scope") === "everyone" ? "everyone" : "me";
  const initialSnapshot = useRef({ scope: initialData.scope, eligible: true });
  const [data, setData] = useState(initialData); const [loading, setLoading] = useState(false); const [error, setError] = useState(false); const [refresh, setRefresh] = useState(0); const [busyTask, setBusyTask] = useState<string>();
  useEffect(() => { const update = () => setRefresh(value => value + 1); window.addEventListener("crm:invalidate", update); return () => window.removeEventListener("crm:invalidate", update); }, []);
  useEffect(() => {
    if (initialSnapshot.current.eligible && initialSnapshot.current.scope === scope && refresh === 0) return;
    initialSnapshot.current.eligible = false;
    const controller = new AbortController(); setLoading(true); setError(false);
    crmRequest<DashboardSummaryData>(`/api/crm/dashboard?scope=${scope}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, refresh]);
  async function completeTask(id: string) {
    setBusyTask(id); setError(false);
    try { await crmRequest(`/api/crm/activities/${id}`, { method: "PATCH", body: JSON.stringify({ completed: true }) }); invalidateCrm("activity"); }
    catch { setError(true); } finally { setBusyTask(undefined); }
  }
  const money = (value: string | number | null, currency: string = data.reportingCurrency) => value === null ? "—" : formatMinor(value, currency, locale);
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";
  const empty = <p className="px-5 py-10 text-center text-xs text-muted-foreground">{labels.empty}</p>;
  const previous = BigInt(data.wonPrevMonth.valueMinor); const delta = previous ? (BigInt(data.wonThisMonth.valueMinor) - previous) * 100n / previous : null;
  const active = data.scope === scope;
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2"><h1 className="min-w-0 text-balance text-2xl font-medium tracking-tight md:text-3xl">{copy.welcome}</h1><ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={scope} aria-label={labels.scope} onValueChange={value => { if (value !== "me" && value !== "everyone") return; const next = new URLSearchParams(search.toString()); next.set("scope", value); pushListQuery(`${pathname}?${next}`); }}><ToggleGroupItem value="me">{copy.me}</ToggleGroupItem><ToggleGroupItem value="everyone">{labels.everyone}</ToggleGroupItem></ToggleGroup><p className="col-span-full text-sm text-muted-foreground">{scope === "me" ? copy.mineSummary : copy.teamSummary}</p></header>
    {error && <div role="alert" className="flex items-center gap-3 text-xs text-destructive">{labels.error}<Button variant="outline" onClick={() => setRefresh(value => value + 1)}>{labels.retry}</Button></div>}
    {!active ? <NavigationSkeleton label={labels.loading} /> : <div aria-busy={loading} className="space-y-6">
      {loading && <span className="sr-only" role="status">{labels.loading}</span>}
      <div className="grid grid-cols-1 overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-4 [&>div]:min-w-0 [&>div]:border-b [&>div:last-child]:border-b-0 sm:[&>div:nth-child(even)]:border-l sm:[&>div:nth-child(n+3)]:border-b-0 xl:[&>div]:border-b-0 xl:[&>div+div]:border-l">
        <StatCard label={labels.won} value={<CompactMoney value={data.wonThisMonth.valueMinor} currency={data.reportingCurrency} locale={locale} />} delta={delta === null ? undefined : { value: `${delta >= 0n ? "+" : ""}${delta}%`, direction: delta > 0n ? "up" : delta < 0n ? "down" : "neutral", label: copy.previousMonth }} description={`${data.wonThisMonth.count} ${labels.count.toLowerCase()} · ${money(data.wonPrevMonth.valueMinor)} ${labels.previousWon.toLowerCase()}`} />
        <StatCard label={labels.pipeline} value={<CompactMoney value={data.pipeline.totalMinor} currency={data.reportingCurrency} locale={locale} />} description={`${data.pipeline.totalDeals} ${labels.count.toLowerCase()} ${copy.inProgress} · ${money(data.closingThisMonthTotal.valueMinor)} ${copy.dueThisMonth}`} />
        <StatCard label={`${labels.winRate} (${data.performance.windowDays} ${labels.days})`} value={data.performance.winRate === null ? "—" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(data.performance.winRate)} description={data.performance.wins + data.performance.losses ? `${data.performance.wins} ${labels.wins} · ${data.performance.losses} ${labels.losses}` : copy.noClosed} />
        <StatCard label={`${labels.averageDeal} (${data.performance.windowDays} ${labels.days})`} value={<CompactMoney value={data.performance.avgDealMinor} currency={data.reportingCurrency} locale={locale} />} description={data.performance.avgCycleDays === null ? copy.noWins : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(data.performance.avgCycleDays)} ${labels.days} ${copy.averageCycle}`} />
      </div>
      {data.unconverted.count > 0 && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{labels.excluded}: <strong className="font-medium text-foreground">{data.unconverted.count}</strong> ({data.unconverted.currencies.join(", ")}). <Link className="underline underline-offset-2" href={`${pathname}/settings/currencies`}>{labels.currencies}</Link></p>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <DashboardPanel title={copy.trendTitle} description={copy.trendDescription}><SalesTrend data={data} locale={locale} /></DashboardPanel>
        <DashboardPanel title={copy.pipelineTitle} description={copy.pipelineDescription}><PipelineDonut data={data} locale={locale} /><ul className="px-5 pb-5 pt-3 md:px-6">{data.pipeline.stages.map((stage, index) => <li key={stage.stageId} className="border-t first:border-0"><Link className="flex items-center gap-2.5 py-2 text-xs hover:underline" href={`${pathname}/deals?stage=${stage.stageId}`}><span aria-hidden="true" className="size-1.5 shrink-0" style={{ backgroundColor: stageColors[index % stageColors.length] }} /><span className="min-w-0 flex-1 truncate">{crm.stages[stage.stageId]}</span><span className="text-muted-foreground tabular-nums">{stage.count}</span><span className="tabular-nums">{<CompactMoney value={stage.valueMinor} currency={data.reportingCurrency} locale={locale} />}</span></Link></li>)}</ul></DashboardPanel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardPanel fixed title={labels.biggest} action={<Button asChild size="sm" variant="ghost"><Link href={`${pathname}/deals`}>{copy.allDeals}</Link></Button>}>{data.biggestOpen.length === 0 ? empty : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full text-left text-xs"><thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="px-5 py-2 font-medium">{crm.deal}</th><th className="hidden px-3 py-2 font-medium lg:table-cell">{copy.stage}</th><th className="px-5 py-2 text-right font-medium">{copy.amount}</th></tr></thead><tbody className="divide-y">{data.biggestOpen.map(deal => <tr key={deal.id} className="hover:bg-muted/30"><td className="px-5 py-2.5"><div className="font-medium"><RecordLink entity="deal" id={deal.id}>{deal.name}</RecordLink></div><div className="mt-1 text-muted-foreground"><RecordLink entity="company" id={deal.company.id}>{deal.company.name}</RecordLink></div></td><td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground lg:table-cell">{crm.stages[deal.stageId]}</td><td className="px-5 py-2.5 text-right tabular-nums"><span title={`${labels.original}: ${money(deal.amountMinor, deal.currency)} · ${labels.closeDate}: ${date(deal.expectedCloseAt)} · ${labels.owner}: ${deal.owner.name}`}>{<CompactMoney value={deal.baseAmountMinor} currency={data.reportingCurrency} locale={locale} />}</span></td></tr>)}</tbody></table></div>}</DashboardPanel>
        <DashboardPanel fixed title={labels.overdue}>{data.overdueTasks.length === 0 ? empty : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full text-left text-xs"><thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="w-8 pl-5"><span className="sr-only">{copy.complete}</span></th><th className="px-3 py-2 font-medium">{copy.task}</th><th className="px-5 py-2 text-right font-medium">{copy.overdue}</th></tr></thead><tbody className="divide-y">{data.overdueTasks.map(task => <tr key={task.id}><td className="pl-5"><input type="checkbox" className="size-3.5 accent-primary" checked={false} disabled={Boolean(busyTask)} onChange={() => void completeTask(task.id)} aria-label={`${copy.complete}: ${task.subject || crm.activity.types.task}`} /></td><td className="px-3 py-2.5"><span className="font-medium">{task.subject || crm.activity.types.task}</span><div className="mt-1 text-muted-foreground">{task.deal ? <RecordLink entity="deal" id={task.deal.id}>{task.deal.name}</RecordLink> : task.company ? <RecordLink entity="company" id={task.company.id}>{task.company.name}</RecordLink> : null}</div></td><td className="px-5 py-2.5 text-right text-destructive tabular-nums"><time dateTime={task.dueAt}>{date(task.dueAt)}</time></td></tr>)}</tbody></table></div>}</DashboardPanel>
      </div>
      <DashboardPanel fixed title={labels.recent}>{data.recentActivity.length === 0 ? empty : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full text-left text-xs"><thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="px-5 py-2 font-medium">{copy.activity}</th><th className="hidden px-3 py-2 font-medium md:table-cell">{crm.company}</th><th className="hidden px-3 py-2 font-medium lg:table-cell">{crm.deal}</th><th className="hidden px-3 py-2 font-medium md:table-cell">{copy.who}</th><th className="px-5 py-2 text-right font-medium">{copy.when}</th></tr></thead><tbody className="divide-y">{data.recentActivity.map(activity => <tr key={activity.id} className="hover:bg-muted/30"><td className="max-w-sm px-5 py-2.5"><div className="font-medium">{activity.subject || crm.activity.types[activity.type]}</div>{activity.content && <p className="mt-1 line-clamp-1 break-words text-muted-foreground">{activity.content}</p>}</td><td className="hidden px-3 py-2.5 md:table-cell">{activity.company ? <RecordLink entity="company" id={activity.company.id}>{activity.company.name}</RecordLink> : "—"}</td><td className="hidden px-3 py-2.5 lg:table-cell">{activity.deal ? <RecordLink entity="deal" id={activity.deal.id}>{activity.deal.name}</RecordLink> : "—"}</td><td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{activity.author.name}</td><td className="whitespace-nowrap px-5 py-2.5 text-right text-muted-foreground"><time dateTime={activity.createdAt}>{date(activity.createdAt)}</time></td></tr>)}</tbody></table></div>}</DashboardPanel>
    </div>}
  </div>;
}
