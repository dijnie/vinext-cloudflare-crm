"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getModuleDictionary } from "@/lib/i18n/module-dictionary";
import type { ModuleSettings as Settings } from "@/lib/services/modules/module-contracts";
import type { EntityType } from "@/lib/listing/list-state";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { crmRequest } from "../record-types";

export function ModuleSettings({ initialData, locale }: { initialData: Settings; locale: AppLocale }) {
  const [settings, setSettings] = useState(initialData);
  const [draft, setDraft] = useState<Partial<Record<EntityType, boolean>>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stale, setStale] = useState(false); const [saved, setSaved] = useState(false);
  const labels = getModuleDictionary(locale); const crm = getCrmDictionary(locale);
  async function reload() { setBusy(true); setError(""); setSaved(false); try { setSettings(await crmRequest<Settings>("/api/crm/modules")); setDraft({}); setStale(false); invalidateCrm("modules"); } catch { setError(labels.error); } finally { setBusy(false); } }
  async function save(entity: EntityType) {
    const module = settings.modules.find(item => item.entity === entity); if (!module || busy || stale || !settings.canManage) return;
    setBusy(true); setError(""); setSaved(false);
    try { const result = await crmRequest<Settings>("/api/crm/modules", { method: "PATCH", body: JSON.stringify({ entity, enabled: draft[entity] ?? module.enabled, revision: module.revision }) }); setSettings(previous => ({ ...result, modules: result.modules.map(item => item.entity !== entity && draft[item.entity] !== undefined ? previous.modules.find(old => old.entity === item.entity)! : item) })); setDraft(previous => { const next = { ...previous }; delete next[entity]; return next; }); setSaved(true); invalidateCrm("modules"); }
    catch (reason) { const conflict = reason instanceof Error && reason.message === "409"; setStale(conflict); setError(conflict ? labels.conflict : labels.error); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto w-full max-w-3xl space-y-6"><div><h1 className="text-2xl font-medium">{labels.title}</h1><p className="mt-2 text-sm text-muted-foreground">{labels.description}</p></div>
    {!settings.canManage && <p role="status">{labels.ownerOnly}</p>}
    <div className="divide-y rounded-lg border">{settings.modules.map(module => <form key={module.entity} className="flex flex-wrap items-center gap-4 p-4" onSubmit={event => { event.preventDefault(); void save(module.entity); }}><label className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" className="size-4 accent-primary" checked={draft[module.entity] ?? module.enabled} disabled={busy || stale || !settings.canManage} onChange={event => { const checked = event.currentTarget.checked; setDraft(previous => ({ ...previous, [module.entity]: checked })); setSaved(false); }} /><span>{labels.entities[module.entity]}<span className="block text-xs text-muted-foreground">{module.enabled ? labels.enabled : labels.disabled}</span></span></label><Button size="sm" type="submit" disabled={busy || stale || !settings.canManage || draft[module.entity] === undefined || draft[module.entity] === module.enabled} aria-label={`${crm.save}: ${labels.entities[module.entity]}`}>{crm.save}</Button></form>)}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{saved && <p role="status" className="text-sm">{labels.saved}</p>}<Button variant="outline" disabled={busy} onClick={() => void reload()}>{labels.reload}</Button>
  </section>;
}
