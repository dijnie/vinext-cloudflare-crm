"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crmRequest } from "@/components/app/record-types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getShellInterfaceDictionary } from "@/lib/i18n/shell-interface-dictionary";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { currencyMutationSchema, type CurrencySettings as Settings, type CurrencyMutation } from "@/lib/services/currencies/currency-contracts";
import type { AppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getCurrencyDictionary } from "@/lib/i18n/currency-dictionary";

export function CurrencySettings({ initialData, locale }: { initialData: Settings; locale: AppLocale }) {
  const labels = getCurrencyDictionary(locale); const copy = getShellInterfaceDictionary(locale);
  const [confirmation, setConfirmation] = useState<{ input: CurrencyMutation; advance?: boolean } | null>(null); const [data, setData] = useState(initialData);
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
  const choices = data.catalog.map(item => ({ value: item.code, label: item.code }));
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="space-y-2"><h1 className="text-2xl font-medium tracking-tight md:text-3xl">{labels.currencies}</h1><p className="text-sm text-muted-foreground">{labels.frozen}</p></header>
    {(error || notice || loading) && <div aria-live="polite" className="text-xs">{error && <p className="text-destructive" role="alert">{error}</p>}{notice && <p className="text-success" role="status">{notice}</p>}{loading && <p role="status">{labels.loading}</p>}</div>}
    <Card><CardHeader><CardTitle><h2>{labels.reporting}</h2></CardTitle><CardDescription>{copy.reportingDescription}</CardDescription></CardHeader><CardContent>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-1"><p className="text-xs font-medium">{labels.current}</p><p className="font-medium tabular-nums">{data.reportingCurrency}</p></div><p className="text-xs text-muted-foreground">{labels.version}: {data.activeVersion}</p></div>
      {data.unconverted.count > 0 && <p className="text-xs text-muted-foreground">{labels.excluded}: <strong className="text-foreground">{data.unconverted.count}</strong> ({data.unconverted.currencies.join(", ")}).</p>}
      {!data.canManage && <p className="text-xs text-muted-foreground">{labels.ownerOnly}</p>}
      {data.canManage && <><div className="flex flex-wrap items-end gap-3"><CurrencySelect label={labels.reporting} value={target} disabled={busy || pending} onChange={setTarget} options={choices} /><Button disabled={busy || pending || target === data.reportingCurrency} onClick={() => setConfirmation({ input: { action: "set_reporting_currency", currency: target as Settings["reportingCurrency"] }, advance: true })}>{labels.change}</Button><Button variant="outline" disabled={busy || pending || data.unconverted.count === 0} onClick={() => void mutate({ action: "fill_missing" }, true)}>{labels.fill}</Button></div><p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{labels.changeHelp}</p></>}
    </CardContent></Card>
    {data.job && <Card><CardHeader><CardTitle><h2>{labels.job}</h2></CardTitle><CardDescription>{labels[data.job.kind]} · {data.job.targetCurrency}</CardDescription></CardHeader><CardContent aria-live="polite"><div className="flex items-center gap-2 text-xs"><span aria-hidden="true" className={`size-1.5 rounded-full ${pending ? "bg-warning" : "bg-success"}`} />{labels[data.job.status]}</div><progress className="h-1.5 w-full accent-primary" aria-label={labels.processed} max={Math.max(1, data.job.total)} value={data.job.processed} /><p className="text-xs tabular-nums">{labels.processed}: {data.job.processed}/{data.job.total} · {labels.converted}: {data.job.converted} · {labels.missing}: {data.job.missing}</p>{pending && <><p className="text-xs">{labels.blocked}</p><p className="text-xs text-muted-foreground">{labels.stopped}</p>{data.canManage && <div className="flex flex-wrap gap-2">{running ? <Button variant="outline" onClick={() => { continueJob.current = false; }}>{labels.stop}</Button> : <Button disabled={busy} onClick={() => void mutate({ action: "resume", jobId: data.job!.id }, true)}>{labels.resume}</Button>}<Button variant="outline" disabled={busy || running} onClick={() => setConfirmation({ input: { action: "cancel", jobId: data.job!.id } })}>{labels.cancelJob}</Button></div>}</>}</CardContent></Card>}
    <Card><CardHeader><CardTitle><h2>{copy.rates}</h2></CardTitle><CardDescription>{copy.ratesDescription}</CardDescription></CardHeader><CardContent>
      <div className="flex flex-wrap items-end justify-between gap-3"><CurrencySelect label={labels.base} value={base} disabled={busy} onChange={value => { setBase(value); void reload(value); }} options={choices} /><Button variant="outline" disabled={busy || loading} onClick={() => void reload()}>{labels.refresh}</Button></div>
      {data.canManage && <form className="space-y-2 border-b pb-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const parsed = currencyMutationSchema.safeParse({ action: "set_manual_rate", baseCurrency: base, currency: form.get("currency"), rate: form.get("rate") }); if (!parsed.success || form.get("currency") === base) { setError(labels.invalid); event.currentTarget.querySelector<HTMLInputElement>("input[name=rate]")?.focus(); return; } void mutate(parsed.data); }}><div className="flex flex-wrap items-end gap-3"><CurrencySelect key={base} label={labels.currency} name="currency" disabled={busy || pending} defaultValue={data.catalog.find(item => item.code !== base)?.code} options={choices.filter(item => item.value !== base)} /><label className="min-w-0 space-y-1 text-xs"><span className="block font-medium">{labels.rate}</span><Input name="rate" type="text" inputMode="decimal" required maxLength={21} pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,10})?" placeholder="1.25" aria-describedby="currency-rate-help" disabled={busy || pending} /></label><Button disabled={busy || pending} type="submit">{labels.addRate}</Button></div><p id="currency-rate-help" className="text-xs leading-relaxed text-muted-foreground">{labels.rateHelp}</p></form>}
      <div className={loading || error ? "invisible min-h-24" : "overflow-x-auto rounded-lg border"} aria-busy={loading}>{data.rates.length === 0 ? <p className="px-4 py-10 text-center text-xs text-muted-foreground">{labels.empty}</p> : <table className="w-full text-left text-xs"><thead className="bg-muted text-muted-foreground"><tr className="border-b"><th className="px-3 py-2.5 font-medium">{labels.currency}</th><th className="px-3 py-2.5 text-right font-medium">{labels.rate}</th><th className="px-3 py-2.5 font-medium">{copy.source}</th><th className="px-3 py-2.5 text-right font-medium">{copy.rateDate}</th><th className="px-3 py-2.5"><span className="sr-only">{labels.remove}</span></th></tr></thead><tbody>{data.rates.map(rate => <tr className="border-b last:border-0" key={`${rate.baseCurrency}-${rate.currency}-${rate.source}`}><th className="whitespace-nowrap px-3 py-2.5 font-medium">{rate.currency} → {rate.baseCurrency}</th><td className="px-3 py-2.5 text-right tabular-nums">{rate.rate}</td><td className="px-3 py-2.5 text-muted-foreground">{rate.source === "manual" ? labels.manual : labels.fetched}{rate.overriding ? ` · ${labels.overriding}` : ""}</td><td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(rate.asOf))}</td><td className="px-3 py-2.5 text-right">{data.canManage && rate.source === "manual" && <Button size="sm" variant="ghost" disabled={busy || pending} aria-label={`${labels.remove}: ${rate.currency} → ${rate.baseCurrency}`} onClick={() => void mutate({ action: "remove_manual_rate", baseCurrency: rate.baseCurrency, currency: rate.currency })}>{labels.remove}</Button>}</td></tr>)}</tbody></table>}</div>
    </CardContent></Card>
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><DialogContent closeLabel={getCrmDictionary(locale).close}><DialogTitle>{confirmation?.input.action === "cancel" ? labels.cancelJob : labels.confirmChange}</DialogTitle><DialogDescription>{confirmation?.input.action === "cancel" ? labels.confirmCancel : `${data.reportingCurrency} → ${target}. ${labels.changeHelp}`}</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmation(null)}>{getCrmDictionary(locale).cancel}</Button><Button variant={confirmation?.input.action === "cancel" ? "destructive" : "default"} onClick={() => { if (confirmation) { const next = confirmation; setConfirmation(null); void mutate(next.input, next.advance); } }}>{confirmation?.input.action === "cancel" ? labels.cancelJob : labels.change}</Button></div></DialogContent></Dialog>
  </div>;
}

function CurrencySelect({ label, options, value, defaultValue, name, disabled, onChange }: { label: string; options: { value: string; label: string }[]; value?: string; defaultValue?: string; name?: string; disabled?: boolean; onChange?: (value: string) => void }) {
  return <div className="space-y-1 text-xs"><span className="block font-medium">{label}</span><Select name={name} value={value} defaultValue={defaultValue} disabled={disabled} onValueChange={onChange}><SelectTrigger aria-label={label} className="min-w-32"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}
