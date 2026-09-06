"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBusinessSettingsDictionary } from "@/lib/i18n/business-settings-dictionary";
import type { AppLocale } from "@/lib/i18n/config";
import { countryCodes } from "@/lib/services/settings/country-codes";
import { businessSettingsInputSchema, type BusinessSettings as Settings } from "@/lib/services/settings/business-settings-contracts";

const commonTimeZones = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

export function BusinessSettings({ initialData, locale }: { initialData: Settings; locale: AppLocale }) {
  const labels = getBusinessSettingsDictionary(locale);
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(locale, { type: "region" });
    return countryCodes.map(code => ({ code, name: names.of(code) ?? code }));
  }, [locale]);
  const [data, setData] = useState(initialData);
  const [timeZone, setTimeZone] = useState(initialData.timeZone);
  const [countryCode, setCountryCode] = useState(initialData.countryCode);
  const [busy, setBusy] = useState<"save" | "reload" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function request(action: "save" | "reload") {
    if (pending.current) return;
    const input = businessSettingsInputSchema.safeParse({ timeZone, countryCode, revision: data.revision });
    if (action === "save" && !input.success) { setError(labels.errors.validation_failed); setNotice(""); return; }
    pending.current = true; setBusy(action); setError(""); setNotice("");
    try {
      const response = await fetch("/api/crm/settings", action === "save" ? { method: "PATCH", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) } : { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
        throw new Error(response.status === 409 ? "conflict" : body?.error?.code ?? "internal_error");
      }
      const next = await response.json() as Settings;
      if (mounted.current) { setData(next); setTimeZone(next.timeZone); setCountryCode(next.countryCode); setConflict(false); setNotice(action === "save" ? labels.saved : labels.reloaded); }
    } catch (reason) {
      if (mounted.current) {
        const code = reason instanceof Error ? reason.message : "internal_error";
        if (code === "conflict") setConflict(true);
        setError(labels.errors[code as keyof typeof labels.errors] ?? labels.errors.internal_error);
      }
    } finally { pending.current = false; if (mounted.current) setBusy(null); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (data.canManage && !conflict) void request("save"); }
  const unchanged = timeZone.trim() === data.timeZone && countryCode.trim().toUpperCase() === data.countryCode;
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="space-y-2"><h1 className="text-2xl font-medium tracking-tight md:text-3xl">{labels.title}</h1><p className="text-sm text-muted-foreground">{labels.description}</p></header>
    {error && <p ref={errorRef} role="alert" tabIndex={-1} className="text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="text-xs text-success">{notice}</p>}
    <Card><CardHeader><CardTitle><h2>{labels.calendar}</h2></CardTitle></CardHeader><CardContent>
      <div className="space-y-1"><p className="text-xs font-medium">{labels.today}</p><time dateTime={data.today} className="text-lg font-medium tabular-nums">{new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${data.today}T12:00:00Z`))}</time><p className="text-xs text-muted-foreground">{labels.dateHelp}</p></div>
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{labels.ownerOnly}</p>
      <form onSubmit={submit} className="space-y-4" aria-busy={busy !== null}>
        <fieldset disabled={busy !== null || !data.canManage} className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs"><span className="block font-medium">{labels.timeZone}</span><Input aria-label={labels.timeZone} required value={timeZone} onChange={event => setTimeZone(event.currentTarget.value)} list="business-time-zones" maxLength={100} aria-describedby="business-time-zone-help" /><datalist id="business-time-zones">{commonTimeZones.map(zone => <option key={zone} value={zone} />)}</datalist><span id="business-time-zone-help" className="block text-muted-foreground">{labels.timeZoneHelp}</span></label>
          <label className="space-y-1 text-xs"><span className="block font-medium">{labels.country}</span><Input aria-label={labels.country} required value={countryCode} onChange={event => setCountryCode(event.currentTarget.value.toUpperCase())} list="business-countries" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" autoCapitalize="characters" aria-describedby="business-country-help" /><datalist id="business-countries">{countries.map(country => <option key={country.code} value={country.code} label={country.name} />)}</datalist><span id="business-country-help" className="block text-muted-foreground">{labels.countryHelp}</span></label>
        </fieldset>
        <div className="flex flex-wrap gap-2">{data.canManage && <Button type="submit" disabled={busy !== null || conflict || unchanged}>{busy === "save" ? labels.saving : labels.save}</Button>}<Button type="button" variant="outline" disabled={busy !== null} onClick={() => void request("reload")}>{busy === "reload" ? labels.loading : labels.reload}</Button></div>
      </form>
      <p className="max-w-3xl border-t pt-4 text-xs leading-relaxed text-muted-foreground">{labels.policy}</p>
    </CardContent></Card>
  </div>;
}
