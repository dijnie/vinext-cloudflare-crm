"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crmRequest } from "@/components/crm/record-types";
import { selectClass } from "@/components/crm/list-toolbar";
import { invalidateCrm } from "@/crm/invalidation";
import { currencyMutationSchema, type CurrencySettings as Settings, type CurrencyMutation } from "@/currency/currency-contracts";
import type { AppLocale } from "@/i18n/config";
import { getCurrencyDictionary } from "@/i18n/currency-dictionary";

export function CurrencySettings({ initialData, locale }: { initialData: Settings; locale: AppLocale }) {
  const labels = getCurrencyDictionary(locale); const [data, setData] = useState(initialData);
  const [base, setBase] = useState<string>(initialData.reportingCurrency); const [target, setTarget] = useState<string>(initialData.reportingCurrency);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [running, setRunning] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null); const continueJob = useRef(false); const mounted = useRef(true);
  const pending = data.job?.status === "pending" || data.job?.status === "running";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; continueJob.current = false; controller.current?.abort(); }; }, []);
  async function reload(selectedBase = base) {
    controller.current?.abort(); const request = new AbortController(); controller.current = request; setLoading(true); setError("");
    try { const next = await crmRequest<Settings>(`/api/crm/currency?baseCurrency=${encodeURIComponent(selectedBase)}`, { signal: request.signal }); if (!request.signal.aborted && mounted.current) setData(next); }
    catch { if (!request.signal.aborted && mounted.current) setError(labels.error); }
    finally { if (!request.signal.aborted && mounted.current) setLoading(false); }
  }
  async function mutate(input: CurrencyMutation, advance = false) {
    if (busy || running) return;
    setError(""); setNotice(""); setLoading(false); setBusy(true); continueJob.current = advance; setRunning(advance);
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    try {
      let action = input;
      do {
        await crmRequest<unknown>("/api/crm/currency", { method: "PATCH", body: JSON.stringify(action), signal: request.signal });
        if (!mounted.current || request.signal.aborted) return;
        const next = await crmRequest<Settings>(`/api/crm/currency?baseCurrency=${encodeURIComponent(base)}`, { signal: request.signal });
        if (!mounted.current || request.signal.aborted) return;
        setData(next); invalidateCrm("currency");
        if (!continueJob.current || !next.job || !["pending", "running"].includes(next.job.status)) break;
        action = { action: "resume", jobId: next.job.id };
      } while (continueJob.current);
      if (mounted.current) setNotice(labels.saved);
    } catch (reason) { if (mounted.current && !request.signal.aborted) setError(reason instanceof Error && reason.message === "409" ? labels.conflict : labels.error); }
    finally { if (mounted.current) { setBusy(false); setRunning(false); } continueJob.current = false; }
  }
  const choices = data.catalog.map(item => <option key={item.code} value={item.code}>{item.code}</option>);
  return <div className="mx-auto max-w-5xl space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">{labels.currencies}</h1><p className="mt-2 text-sm text-muted-foreground">{labels.frozen}</p></div>
    <div aria-live="polite">{error && <p className="text-destructive" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">{labels.loading}</p>}</div>
    <section className="space-y-4 rounded-lg border bg-background p-5"><h2 className="font-semibold">{labels.current}: {data.reportingCurrency}</h2><p className="text-sm text-muted-foreground">{labels.version}: {data.activeVersion}</p>{data.unconverted.count > 0 && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{labels.excluded}: {data.unconverted.count} ({data.unconverted.currencies.join(", ")}).</p>}{!data.canManage && <p className="text-sm">{labels.ownerOnly}</p>}
      {data.canManage && <><p className="text-sm text-muted-foreground">{labels.changeHelp}</p><div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm"><span className="block">{labels.reporting}</span><select aria-label={labels.reporting} className={selectClass} value={target} disabled={busy || pending} onChange={event => setTarget(event.target.value)}>{choices}</select></label><Button disabled={busy || pending || target === data.reportingCurrency} onClick={() => { if (window.confirm(`${labels.confirmChange}: ${data.reportingCurrency} → ${target}?\n${labels.changeHelp}`)) void mutate({ action: "set_reporting_currency", currency: target as Settings["reportingCurrency"] }, true); }}>{labels.change}</Button><Button variant="outline" disabled={busy || pending || data.unconverted.count === 0} onClick={() => void mutate({ action: "fill_missing" }, true)}>{labels.fill}</Button></div></>}
    </section>
    {data.job && <section className="space-y-3 rounded-lg border bg-background p-5" aria-live="polite"><h2 className="font-semibold">{labels.job} · {labels[data.job.kind]} · {data.job.targetCurrency}</h2><p>{labels[data.job.status]}</p><progress className="w-full" aria-label={labels.processed} max={Math.max(1, data.job.total)} value={data.job.processed} /><p className="text-sm">{labels.processed}: {data.job.processed}/{data.job.total} · {labels.converted}: {data.job.converted} · {labels.missing}: {data.job.missing}</p>{pending && <><p className="text-sm">{labels.blocked}</p><p className="text-sm text-muted-foreground">{labels.stopped}</p>{data.canManage && <div className="flex flex-wrap gap-3">{running ? <Button variant="outline" onClick={() => { continueJob.current = false; }}>{labels.stop}</Button> : <Button disabled={busy} onClick={() => void mutate({ action: "resume", jobId: data.job!.id }, true)}>{labels.resume}</Button>}<Button variant="destructive" disabled={busy || running} onClick={() => { if (window.confirm(labels.confirmCancel)) void mutate({ action: "cancel", jobId: data.job!.id }); }}>{labels.cancelJob}</Button></div>}</>}</section>}
    <section className="space-y-4 rounded-lg border bg-background p-5"><div className="flex flex-wrap items-end justify-between gap-3"><label className="space-y-1 text-sm"><span className="block">{labels.base}</span><select aria-label={labels.base} className={selectClass} value={base} disabled={busy} onChange={event => { setBase(event.target.value); void reload(event.target.value); }}>{choices}</select></label><Button variant="outline" disabled={busy || loading} onClick={() => void reload()}>{labels.refresh}</Button></div>
      {data.canManage && <form className="space-y-3 border-b pb-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const parsed = currencyMutationSchema.safeParse({ action: "set_manual_rate", baseCurrency: base, currency: form.get("currency"), rate: form.get("rate") }); if (!parsed.success || form.get("currency") === base) { setError(labels.invalid); event.currentTarget.querySelector<HTMLInputElement>("input")?.focus(); return; } void mutate(parsed.data); }}><div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm"><span className="block">{labels.currency}</span><select aria-label={labels.currency} name="currency" className={selectClass} disabled={busy || pending} defaultValue={data.catalog.find(item => item.code !== base)?.code}>{data.catalog.filter(item => item.code !== base).map(item => <option key={item.code}>{item.code}</option>)}</select></label><label className="min-w-0 space-y-1 text-sm"><span className="block">{labels.rate}</span><Input name="rate" type="text" inputMode="decimal" required maxLength={21} pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,10})?" placeholder="1.25" aria-describedby="currency-rate-help" disabled={busy || pending} /></label><Button disabled={busy || pending} type="submit">{labels.addRate}</Button></div><p id="currency-rate-help" className="text-sm text-muted-foreground">{labels.rateHelp}</p></form>}
      <div className={loading || error ? "invisible min-h-24" : "overflow-x-auto"} aria-busy={loading}>{data.rates.length === 0 ? <p className="text-sm text-muted-foreground">{labels.empty}</p> : <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">{labels.currency}</th><th className="p-2">{labels.rate}</th><th className="p-2">{labels.asOf}</th><th className="p-2"><span className="sr-only">{labels.remove}</span></th></tr></thead><tbody>{data.rates.map(rate => <tr className="border-b last:border-0" key={`${rate.baseCurrency}-${rate.currency}-${rate.source}`}><th className="p-2">{rate.currency} → {rate.baseCurrency}</th><td className="p-2 tabular-nums">{rate.rate}<p className="text-xs text-muted-foreground">{rate.source === "manual" ? labels.manual : labels.fetched}{rate.overriding ? ` · ${labels.overriding}` : ""}</p></td><td className="whitespace-nowrap p-2">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(rate.asOf))}</td><td className="p-2">{data.canManage && rate.source === "manual" && <Button size="sm" variant="outline" disabled={busy || pending} aria-label={`${labels.remove}: ${rate.currency} → ${rate.baseCurrency}`} onClick={() => void mutate({ action: "remove_manual_rate", baseCurrency: rate.baseCurrency, currency: rate.currency })}>{labels.remove}</Button>}</td></tr>)}</tbody></table>}</div>
    </section>
  </div>;
}
