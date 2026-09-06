"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RecordLink } from "@/components/app/record-sheet/record-link";
import { crmRequest } from "@/components/app/record-types";
import type { AppLocale } from "@/lib/i18n/config";
import { getReportDictionary } from "@/lib/i18n/report-dictionary";
import { formatMinor, minorUnitsOf } from "@/lib/services/currencies/currency-catalog";
import type { ReportOutput } from "@/lib/services/reports/report-contracts";

function toMinor(value: string, currency: string): string | null {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const places = minorUnitsOf(currency), [whole, decimal = ""] = value.split(".");
  if (places === 0 && decimal.replaceAll("0", "")) return null;
  return (BigInt(whole) * 10n ** BigInt(places) + BigInt(decimal.padEnd(places, "0").slice(0, places) || "0")).toString();
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="min-w-0 p-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-xl font-medium tabular-nums">{value}</dd>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</div>; }

export function ReportDashboard({ initialData, locale }: { initialData: ReportOutput; locale: AppLocale }) {
  const labels = getReportDictionary(locale), router = useRouter(), pathname = usePathname();
  const [from, setFrom] = useState(initialData.input.from), [to, setTo] = useState(initialData.input.to), [goalAmount, setGoalAmount] = useState(""), [goalState, setGoalState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const [scopeOptions, setScopeOptions] = useState<{ members: Array<{ membershipId: string; name: string; status: string }>; branches: Array<{ id: string; name: string; archivedAt: string | null }> }>({ members: [], branches: [] });
  useEffect(() => { const refresh = () => router.refresh(); window.addEventListener("crm:invalidate", refresh); return () => window.removeEventListener("crm:invalidate", refresh); }, [router]);
  useEffect(() => {
    if (!initialData.capabilities.setGoal) return;
    let active = true;
    void crmRequest<typeof scopeOptions>("/api/crm/access").then(value => { if (active) setScopeOptions(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [initialData.capabilities.setGoal]);
  const money = (value: string | null) => value === null ? labels.insufficientCost : formatMinor(value, initialData.reportingCurrency, locale);
  const percent = (value: number | null) => value === null ? labels.noBasis : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
  const minutes = (value: number | null) => value === null ? labels.noBasis : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${labels.minutes}`;
  const query = new URLSearchParams({ from, to, scope: initialData.input.scope });
  if (initialData.input.scopeId) query.set("scopeId", initialData.input.scopeId);
  if (initialData.input.source) query.set("source", initialData.input.source);
  if (initialData.input.recorderUserId) query.set("recorderUserId", initialData.input.recorderUserId);
  function apply(next: Record<string, string | undefined> = {}) { const value = new URLSearchParams(query); for (const [key, item] of Object.entries(next)) item ? value.set(key, item) : value.delete(key); router.push(`${pathname}?${value}`); }
  async function saveGoal() {
    const amountMinor = toMinor(goalAmount, initialData.reportingCurrency); if (amountMinor === null) return setGoalState("error");
    setGoalState("busy");
    const scopeKind = initialData.input.scope === "everyone" ? "workspace" : initialData.input.scope === "branch" ? "branch" : "member";
    const scopeId = initialData.input.scope === "me" ? initialData.viewerMembershipId : initialData.input.scopeId ?? "";
    try { await crmRequest("/api/crm/reports/goals", { method: "PUT", body: JSON.stringify({ from, to, scopeKind, scopeId, amountMinor }) }); setGoalState("saved"); router.refresh(); }
    catch { setGoalState("error"); }
  }
  const exportHref = `/api/crm/reports/export?${query}`;
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-medium tracking-tight md:text-3xl">{labels.title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{labels.description}</p></div><div className="flex gap-2">{initialData.capabilities.export ? <Button asChild variant="outline"><a href={exportHref}>{labels.export}</a></Button> : <span className="self-center text-xs text-muted-foreground">{labels.noExport}</span>}</div></header>
    <Card><CardHeader><CardTitle>{labels.filters}</CardTitle></CardHeader><CardContent className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-7">
      <label className="space-y-1 text-xs">{labels.from}<Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="space-y-1 text-xs">{labels.to}<Input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <label className="space-y-1 text-xs">{labels.source}<select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={initialData.input.source ?? ""} onChange={event => apply({ source: event.target.value || undefined })}><option value="">{labels.allSources}</option>{initialData.sources.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <label className="space-y-1 text-xs">{labels.recorder}<select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={initialData.input.recorderUserId ?? ""} onChange={event => apply({ recorderUserId: event.target.value || undefined })}><option value="">{labels.allRecorders}</option>{initialData.recorders.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <div className="flex h-8 rounded-md border p-0.5"><button className={`flex-1 rounded px-2 text-xs ${initialData.input.scope === "me" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => apply({ scope: "me", scopeId: undefined, recorderUserId: undefined })}>{labels.mine}</button><button className={`flex-1 rounded px-2 text-xs ${initialData.input.scope === "everyone" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => apply({ scope: "everyone", scopeId: undefined })}>{labels.everyone}</button></div>
      {initialData.capabilities.setGoal && <label className="space-y-1 text-xs">{labels.specificScope}<select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={["member", "branch"].includes(initialData.input.scope) ? `${initialData.input.scope}:${initialData.input.scopeId}` : ""} onChange={event => { const [scope, scopeId] = event.target.value.split(":"); if (scopeId) apply({ scope, scopeId }); }}><option value="">{labels.specificScope}</option>{scopeOptions.members.filter(item => item.status === "active").map(item => <option key={`member:${item.membershipId}`} value={`member:${item.membershipId}`}>{labels.memberScope}: {item.name}</option>)}{scopeOptions.branches.filter(item => !item.archivedAt).map(item => <option key={`branch:${item.id}`} value={`branch:${item.id}`}>{labels.branchScope}: {item.name}</option>)}</select></label>}
      <Button onClick={() => apply()}>{labels.apply}</Button>
    </CardContent></Card>
    {initialData.coverage.excludedOrders > 0 && <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">{labels.excluded}: {initialData.coverage.excludedOrders} ({initialData.coverage.excludedCurrencies.join(", ")})</p>}
    <dl className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-4 [&>div]:border-b sm:[&>div:nth-child(even)]:border-l xl:[&>div]:border-b-0 xl:[&>div+div]:border-l"><Metric label={labels.orderValue} value={money(initialData.sales.orderValueMinor)} note={`${labels.comparison}: ${money(initialData.comparison.previousMinor)} · ${percent(initialData.comparison.changeRate)}`} /><Metric label={labels.grossProfit} value={money(initialData.sales.grossProfitMinor)} note={`${labels.costCoverage}: ${percent(initialData.coverage.costCoverage)}`} /><Metric label={labels.collections} value={money(initialData.sales.netCollectionMinor)} note={`${labels.receivable}: ${money(initialData.sales.receivableMinor)}`} /><Metric label={labels.averageOrder} value={initialData.sales.averageOrderMinor === null ? labels.noBasis : money(initialData.sales.averageOrderMinor)} note={`${initialData.sales.completedOrders} ${labels.orders.toLowerCase()}`} /></dl>
    <div className="grid gap-6 lg:grid-cols-3"><Card><CardHeader><CardTitle>{labels.customers}</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">{labels.buyingContacts}</dt><dd className="text-xl font-medium">{initialData.customers.buyingContacts}</dd></div><div><dt className="text-muted-foreground">{labels.repeat}</dt><dd className="text-xl font-medium">{percent(initialData.customers.repeatRate)}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">{labels.totalPurchase}</dt><dd className="font-medium">{money(initialData.customers.totalPurchaseMinor)}</dd></div></dl></CardContent></Card>
      <Card><CardHeader><CardTitle>{labels.conversion}</CardTitle></CardHeader><CardContent><p className="text-2xl font-medium">{percent(initialData.leads.cohortRate)}</p><p className="text-xs text-muted-foreground">{initialData.leads.convertedFromCohort}/{initialData.leads.cohort} · {initialData.leads.convertedInPeriod} {labels.completed.toLowerCase()}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>{labels.goal}</CardTitle></CardHeader><CardContent>{initialData.goal ? <><p className="text-2xl font-medium">{money(initialData.goal.amountMinor)}</p><p className="text-xs text-muted-foreground">{percent(initialData.goal.progressRate)}</p></> : <p className="text-sm text-muted-foreground">{labels.noBasis}</p>}{initialData.capabilities.setGoal && <div className="mt-4 flex gap-2"><Input type="number" min="0" step={minorUnitsOf(initialData.reportingCurrency) ? "0.01" : "1"} placeholder={`${labels.goalAmount} (${initialData.reportingCurrency})`} value={goalAmount} onChange={event => setGoalAmount(event.target.value)} /><Button disabled={goalState === "busy"} onClick={() => void saveGoal()}>{labels.saveGoal}</Button></div>}{goalState === "saved" && <p className="mt-2 text-xs text-emerald-600">{labels.saved}</p>}{goalState === "error" && <p role="alert" className="mt-2 text-xs text-destructive">{labels.error}</p>}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>{labels.work}</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label={labels.overdueTasks} value={String(initialData.work.openOverdueTasks)} /><Metric label={labels.taskOnTime} value={percent(initialData.work.taskOnTimeRate)} /><Metric label={labels.overdueTickets} value={String(initialData.work.openOverdueTickets)} /><Metric label={labels.ticketOnTime} value={percent(initialData.work.ticketOnTimeRate)} /><Metric label={labels.responseTime} value={minutes(initialData.work.averageFirstResponseMinutes)} /><Metric label={labels.resolutionTime} value={minutes(initialData.work.averageResolutionMinutes)} /></dl></CardContent></Card>
    <Card><CardHeader><CardTitle>{labels.demographics}</CardTitle></CardHeader><CardContent className="grid gap-6 md:grid-cols-2"><Demographics title={labels.age} rows={initialData.customers.ages} percent={percent} /><Demographics title={labels.gender} rows={initialData.customers.genders} percent={percent} /></CardContent></Card>
    <Card><CardHeader><CardTitle>{labels.orders}</CardTitle></CardHeader><div className="overflow-auto rounded-lg border bg-card"><table className="w-full min-w-[800px] text-left text-xs"><thead className="border-b bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">{labels.orders}</th><th className="px-4 py-2">{labels.contact}</th><th className="px-4 py-2">{labels.source}</th><th className="px-4 py-2">{labels.recorder}</th><th className="px-4 py-2">{labels.completed}</th><th className="px-4 py-2 text-right">{labels.beforeTax}</th><th className="px-4 py-2 text-right">{labels.tax}</th><th className="px-4 py-2 text-right">{labels.cost}</th></tr></thead><tbody className="divide-y">{initialData.orders.map(order => <tr key={order.id}><td className="px-4 py-2">{order.number}</td><td className="px-4 py-2 font-medium"><RecordLink entity="order" id={order.id}>{order.name}</RecordLink></td><td className="px-4 py-2"><RecordLink entity="contact" id={order.contactId}>{order.contactName}</RecordLink></td><td className="px-4 py-2">{order.source ?? "—"}</td><td className="px-4 py-2">{order.recorderName ?? "—"}</td><td className="px-4 py-2">{order.completedDate}</td><td className="px-4 py-2 text-right">{money(order.valueBeforeTaxMinor)}</td><td className="px-4 py-2 text-right">{money(order.taxMinor)}</td><td className="px-4 py-2 text-right">{order.costMinor === null ? labels.insufficientCost : money(order.costMinor)}</td></tr>)}{initialData.orders.length === 0 && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={9}>{labels.empty}</td></tr>}</tbody></table></div></Card>
    <p className="text-xs leading-relaxed text-muted-foreground">{initialData.definition} · {labels.queryEvidence}: {initialData.query.statements} {labels.statements}, {initialData.query.rowsRead} {labels.rowsRead}.</p>
  </div>;
}

function Demographics({ title, rows, percent }: { title: string; rows: ReportOutput["customers"]["ages"]; percent: (value: number | null) => string }) { return <div><h3 className="mb-2 text-sm font-medium">{title}</h3><ul className="divide-y rounded-md border">{rows.map(row => <li className="flex justify-between gap-3 px-3 py-2 text-xs" key={row.key}><span>{row.key}</span><span>{row.count} · {percent(row.rate)}</span></li>)}</ul></div>; }
