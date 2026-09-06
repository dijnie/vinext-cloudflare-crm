"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getLayoutDictionary } from "@/lib/i18n/layout-dictionary";
import { layoutIdentity, type LayoutEntry, type LayoutSettings as Settings } from "@/lib/services/layouts/layout-contracts";
import { crmRequest, fieldLabel } from "../record-types";

export function LayoutSettings({ initialData, locale }: { initialData: Settings[]; locale: AppLocale }) {
  const [layouts, setLayouts] = useState(initialData);
  const [selected, setSelected] = useState(initialData[0]!.entity);
  return <section className="mx-auto w-full max-w-3xl space-y-5"><h1 className="text-2xl font-medium">{getLayoutDictionary(locale).title}</h1><p className="text-sm text-muted-foreground">{getLayoutDictionary(locale).description}</p><nav className="flex flex-wrap gap-2" aria-label={getLayoutDictionary(locale).title}>{layouts.map(item => <Button key={item.entity} variant={selected === item.entity ? "default" : "outline"} onClick={() => setSelected(item.entity)}>{getCrmDictionary(locale)[item.entity]}</Button>)}</nav><LayoutForm key={selected} initial={layouts.find(item => item.entity === selected)!} locale={locale} onPersisted={next => setLayouts(previous => previous.map(item => item.entity === next.entity ? next : item))} /></section>;
}
function LayoutForm({ initial, locale, onPersisted }: { initial: Settings; locale: AppLocale; onPersisted: (next: Settings) => void }) {
  const [settings, setSettings] = useState(initial);
  const [draft, setDraft] = useState<LayoutEntry[]>(initial.fields);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stale, setStale] = useState(false); const [saved, setSaved] = useState(false);
  const labels = getLayoutDictionary(locale); const crm = getCrmDictionary(locale);
  function reset(next: Settings) { onPersisted(next); setSettings(next); setDraft(next.fields); setError(""); setStale(false); }
  async function reload() { setBusy(true); setSaved(false); try { reset(await crmRequest<Settings>(`/api/crm/layouts?entity=${settings.entity}`)); } catch { setError(crm.error); } finally { setBusy(false); } }
  async function save() { setBusy(true); setError(""); setSaved(false); try { reset(await crmRequest<Settings>("/api/crm/layouts", { method: "PATCH", body: JSON.stringify({ entity: settings.entity, revision: settings.revision, fields: draft.map(({ key, kind, visible }) => ({ key, kind, visible })) }) })); setSaved(true); } catch (reason) { const conflict = reason instanceof Error && reason.message === "409"; setStale(conflict); setError(conflict ? labels.conflict : crm.error); } finally { setBusy(false); } }
  function move(index: number, direction: number) { setDraft(previous => { const next = [...previous]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; return next; }); setSaved(false); }
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}><ol className="divide-y rounded-md border">{draft.map((entry, index) => {
    const field = settings.fields.find(item => layoutIdentity(item) === layoutIdentity(entry))!;
    const name = field.kind === "custom" ? field.label! : fieldLabel(field.key, crm);
    return <li key={layoutIdentity(field)} className="flex flex-wrap items-center gap-2 p-3" data-layout-field={layoutIdentity(field)}><label className="flex min-w-0 flex-1 items-start gap-2"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" aria-label={`${labels.visible}: ${name}`} checked={entry.visible} disabled={busy || stale || field.required || !settings.canManage} onChange={event => { const visible = event.currentTarget.checked; setDraft(previous => previous.map(item => layoutIdentity(item) === layoutIdentity(entry) ? { ...item, visible } : item)); setSaved(false); }} /><span className="min-w-0 break-words text-sm">{name}<span className="block text-xs text-muted-foreground">{field.kind === "custom" ? labels.custom : labels.system}{field.required ? ` · ${labels.required}` : ""}{field.readOnly ? ` · ${labels.readonly}` : ""}<span className="block">{field.surfaces.map(surface => labels[surface]).join(" · ")}</span></span></span></label><div className="flex gap-1"><Button size="sm" type="button" variant="outline" aria-label={`${labels.up}: ${name}`} disabled={busy || stale || index === 0 || !settings.canManage} onClick={() => move(index, -1)}>↑</Button><Button size="sm" type="button" variant="outline" aria-label={`${labels.down}: ${name}`} disabled={busy || stale || index === draft.length - 1 || !settings.canManage} onClick={() => move(index, 1)}>↓</Button></div></li>;
  })}</ol>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{saved && <p role="status">{labels.saved}</p>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || stale || !settings.canManage}>{crm.save}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { reset(settings); setSaved(false); }}>{labels.cancel}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>{labels.reload}</Button></div></form>;
}
