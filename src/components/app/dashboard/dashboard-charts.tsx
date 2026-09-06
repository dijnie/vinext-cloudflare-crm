"use client";
import { useDealStages } from "../deal-stage-provider";

import { CompactMoney } from "./compact-money";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { DashboardSummaryData } from "@/lib/services/dashboard/dashboard-contracts";
import type { AppLocale } from "@/lib/i18n/config";
import { getCurrencyDictionary } from "@/lib/i18n/currency-dictionary";
import { getShellInterfaceDictionary } from "@/lib/i18n/shell-interface-dictionary";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { formatMinor } from "@/lib/services/currencies/currency-catalog";

export const stageColors = ["var(--chart-2)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--chart-1)"];
// Only chart geometry is normalized; money labels retain the exact API strings.
function proportion(value: string, maximum: bigint) { return maximum === 0n ? 0 : Number(BigInt(value) * 1_000_000n / maximum) / 1_000_000; }

export function SalesTrend({ data, locale }: { data: DashboardSummaryData; locale: AppLocale }) {
  const id = useId().replaceAll(":", ""); const labels = getCurrencyDictionary(locale); const copy = getShellInterfaceDictionary(locale);
  const maximum = data.trend.reduce((max, point) => [BigInt(point.wonMinor), BigInt(point.createdMinor)].reduce((a, b) => a > b ? a : b, max), 0n);
  const points = data.trend.map(point => ({ ...point, won: proportion(point.wonMinor, maximum), created: proportion(point.createdMinor, maximum), label: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${point.month}-01T00:00:00Z`)) }));
  const money = (value: string) => formatMinor(value, data.reportingCurrency, locale);
  return <div className="flex flex-1 flex-col justify-center gap-4 px-5 pb-5 pt-4">
    {maximum > 0n ? <div className="h-[196px] w-full" role="img" aria-label={copy.trendTitle}><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}><defs><linearGradient id={`${id}-won`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient><linearGradient id={`${id}-created`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.16} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickMargin={10} /><Tooltip content={({ active, payload }) => { const point = payload?.[0]?.payload as typeof points[number] | undefined; return active && point ? <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"><p className="mb-1 font-medium">{point.label}</p><p>{labels.wonValue}: {money(point.wonMinor)}</p><p>{labels.created}: {money(point.createdMinor)}</p></div> : null; }} /><Area type="monotone" dataKey="created" stroke="var(--chart-1)" fill={`url(#${id}-created)`} strokeWidth={2} isAnimationActive={false} /><Area type="monotone" dataKey="won" stroke="var(--success)" fill={`url(#${id}-won)`} strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <p className="flex h-[196px] items-center justify-center text-xs text-muted-foreground">{labels.empty}</p>}
    <div className="flex justify-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-success" />{labels.wonValue}</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-1" />{labels.created}</span></div>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{copy.chartData}</summary><table className="mt-2 w-full text-left"><thead><tr className="border-b"><th className="py-2 font-medium">{labels.month}</th><th className="text-right font-medium">{labels.created}</th><th className="text-right font-medium">{labels.wonValue}</th></tr></thead><tbody>{points.map(point => <tr key={point.month} className="border-b last:border-0"><td className="py-2">{point.month}</td><td className="text-right tabular-nums">{money(point.createdMinor)}</td><td className="text-right tabular-nums">{money(point.wonMinor)}</td></tr>)}</tbody></table></details>
  </div>;
}

export function PipelineDonut({ data, locale }: { data: DashboardSummaryData; locale: AppLocale }) {
  const stageCatalog = useDealStages();
  const labels = getCurrencyDictionary(locale); const crm = getCrmDictionary(locale); const copy = getShellInterfaceDictionary(locale);
  const total = BigInt(data.pipeline.totalMinor);
  const slices = data.pipeline.stages.map((stage, index) => ({ ...stage, value: proportion(stage.valueMinor, total), fill: stageColors[index % stageColors.length], name: stageCatalog.label(stage.stageId) })).filter(stage => BigInt(stage.valueMinor) > 0n);
  return <div className="relative h-[168px]" role="img" aria-label={copy.pipelineTitle}>
    {slices.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={slices} dataKey="value" innerRadius={58} outerRadius={76} paddingAngle={2} stroke="none" isAnimationActive={false}>{slices.map(slice => <Cell key={slice.stageId} fill={slice.fill} />)}</Pie><Tooltip content={({ active, payload }) => { const slice = payload?.[0]?.payload as typeof slices[number] | undefined; return active && slice ? <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"><p className="font-medium">{slice.name}</p><p>{formatMinor(slice.valueMinor, data.reportingCurrency, locale)} · {slice.count} {labels.count.toLowerCase()}</p></div> : null; }} /></PieChart></ResponsiveContainer> : <div className="mx-auto mt-2 size-[152px] rounded-full border-[18px] border-muted" />}
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="max-w-28 break-words text-center text-sm font-medium tabular-nums">{<CompactMoney value={data.pipeline.totalMinor} currency={data.reportingCurrency} locale={locale} />}</span><span className="text-xs text-muted-foreground">{data.pipeline.totalDeals} {labels.count.toLowerCase()}</span></div>
  </div>;
}
