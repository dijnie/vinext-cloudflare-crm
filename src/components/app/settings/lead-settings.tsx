"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getLeadDictionary, leadChoiceLabel } from "@/lib/i18n/lead-dictionary";
import type { LeadSettings as Catalog, LeadSettingsMutation } from "@/lib/services/leads/lead-settings-contract";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { crmRequest } from "../record-types";
import { FormSelect } from "../record-sheet/form-select";

type Change = LeadSettingsMutation extends infer T ? T extends { revision: number } ? Omit<T, "revision"> : never : never;
type Kind = "source" | "status";

export function LeadSettings({ initialData, locale }: { initialData: Catalog; locale: AppLocale }) {
  const [catalog, setCatalog] = useState(initialData);
  const [kind, setKind] = useState<Kind>("source");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, boolean>>({});
  const [newNames, setNewNames] = useState({ source: "", status: "" });
  const [meaning, setMeaning] = useState<"working" | "rejected">("working");
  const [requiresReason, setRequiresReason] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const labels = getLeadDictionary(locale), crm = getCrmDictionary(locale);
  const rows = kind === "source" ? catalog.sources : catalog.statuses;
  const disabled = busy || stale || !catalog.canManage;
  const key = (id: string) => `${kind}:${id}`;

  function discardLabel(id: string) {
    setDrafts(previous => { const next = { ...previous }; delete next[id]; return next; });
  }
  function discardReason(id: string) {
    setReasonDrafts(previous => { const next = { ...previous }; delete next[id]; return next; });
  }
  async function mutate(change: Change) {
    if (disabled) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      setCatalog(await crmRequest<Catalog>("/api/crm/lead-settings", {
        method: "PATCH", body: JSON.stringify({ ...change, revision: catalog.revision }),
      }));
      if (change.action === "create") setNewNames(previous => ({ ...previous, [change.kind]: "" }));
      if (change.action === "relabel") discardLabel(`${change.kind}:${change.id}`);
      if (change.action === "reason") discardReason(change.id);
      setSaved(true); invalidateCrm("lead");
    } catch (reason) {
      const conflict = reason instanceof Error && reason.message === "409";
      setStale(conflict); setError(conflict ? labels.settingsConflict : crm.error);
    } finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true); setSaved(false);
    try {
      setCatalog(await crmRequest<Catalog>("/api/crm/lead-settings"));
      setDrafts({}); setReasonDrafts({}); setStale(false); setError("");
      invalidateCrm("lead");
    } catch { setError(crm.error); } finally { setBusy(false); }
  }

  return <section className="mx-auto w-full max-w-3xl space-y-5">
    <h1 className="text-2xl font-medium">{labels.title}</h1>
    <p className="text-sm text-muted-foreground">{labels.description}</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label={labels.title}>
      {(["source", "status"] as const).map(value => <Button key={value} variant={kind === value ? "default" : "outline"} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "source" ? labels.sources : labels.statuses}</Button>)}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm">{labels.settingsSaved}</p>}
    <form className="space-y-3 rounded-md border p-4" onSubmit={event => {
      event.preventDefault();
      void mutate(kind === "source" ? { action: "create", kind, label: newNames.source } : { action: "create", kind, label: newNames.status, meaning, requiresReason: meaning === "rejected" && requiresReason });
    }}>
      <h2 className="font-medium">{crm.add}: {kind === "source" ? labels.sources : labels.statuses}</h2>
      <label className="block space-y-1 text-sm">{labels.label}<Input required maxLength={100} value={newNames[kind]} disabled={disabled} onChange={event => { const value = event.currentTarget.value; setNewNames(previous => ({ ...previous, [kind]: value })); }} /></label>
      {kind === "status" && <>
        <label className="block space-y-1 text-sm" htmlFor="new-lead-status-meaning">{labels.meaning}</label>
        <FormSelect id="new-lead-status-meaning" value={meaning} disabled={disabled} onValueChange={value => setMeaning(value as typeof meaning)} options={(["working", "rejected"] as const).map(value => ({ value, label: labels[value] }))} />
        <p className="text-xs text-muted-foreground">{labels.meaningHelp}</p>
        {meaning === "rejected" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={requiresReason} disabled={disabled} onChange={event => setRequiresReason(event.currentTarget.checked)} />{labels.reason}</label>}
      </>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={disabled || !newNames[kind].trim()}>{crm.add}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setNewNames(previous => ({ ...previous, [kind]: "" })); if (kind === "status") { setMeaning("working"); setRequiresReason(false); } }}>{crm.cancel}</Button>
      </div>
    </form>
    <ol className="space-y-3">
      {rows.map((row, index) => {
        const shown = leadChoiceLabel(row, locale), draftKey = key(row.id);
        const status = kind === "status" ? catalog.statuses.find(status => status.id === row.id) : undefined;
        const protectedChoice = kind === "source" ? row.id === catalog.defaultSourceId : [catalog.defaultStatusId, "converted"].includes(row.id);
        const seeded = kind === "source" ? row.id === "manual" : ["new", "contacted", "nurturing", "unqualified", "converted"].includes(row.id);
        return <li key={draftKey} className="space-y-4 rounded-md border p-4" data-lead-choice-id={row.id}>
          <form className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate({ action: "relabel", kind, id: row.id, label: drafts[draftKey] ?? shown }); }}>
            <label className="block space-y-1 text-sm">{shown}<Input aria-label={`${labels.label}: ${shown}`} required maxLength={100} disabled={disabled} value={drafts[draftKey] ?? shown} onChange={event => { const value = event.currentTarget.value; setDrafts(previous => ({ ...previous, [draftKey]: value })); }} /></label>
            <p className="text-xs text-muted-foreground">{[status ? labels[status.meaning] : null, protectedChoice ? labels.defaultChoice : null, row.archivedAt ? crm.archived : null].filter(Boolean).join(" · ")}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" type="submit" disabled={disabled || drafts[draftKey] === undefined}>{crm.save}</Button>
              <Button size="sm" type="button" variant="outline" disabled={busy || drafts[draftKey] === undefined} onClick={() => discardLabel(draftKey)}>{crm.cancel}</Button>
              {seeded && <Button size="sm" type="button" variant="outline" disabled={disabled || row.label === null} onClick={() => void mutate({ action: "relabel", kind, id: row.id, label: null })}>{labels.resetLabel}</Button>}
              <Button size="sm" type="button" variant="outline" aria-label={`${labels.up}: ${shown}`} disabled={disabled || index === 0} onClick={() => void mutate({ action: "reorder", kind, id: row.id, beforeId: rows[index - 1]!.id })}>↑</Button>
              <Button size="sm" type="button" variant="outline" aria-label={`${labels.down}: ${shown}`} disabled={disabled || index === rows.length - 1} onClick={() => void mutate({ action: "reorder", kind, id: row.id, beforeId: rows[index + 2]?.id ?? null })}>↓</Button>
              <Button size="sm" type="button" variant="outline" disabled={disabled || protectedChoice} onClick={() => void mutate({ action: row.archivedAt ? "restore" : "archive", kind, id: row.id })}>{row.archivedAt ? labels.restoreChoice : labels.archiveChoice}</Button>
            </div>
          </form>
          {status?.meaning === "rejected" && <form className="space-y-2 border-t pt-3" onSubmit={event => { event.preventDefault(); void mutate({ action: "reason", kind: "status", id: row.id, requiresReason: reasonDrafts[row.id] ?? status.requiresReason }); }}>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reasonDrafts[row.id] ?? status.requiresReason} disabled={disabled} onChange={event => { const checked = event.currentTarget.checked; setReasonDrafts(previous => ({ ...previous, [row.id]: checked })); }} />{labels.reason}</label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" type="submit" disabled={disabled || reasonDrafts[row.id] === undefined}>{crm.save}</Button>
              <Button size="sm" type="button" variant="outline" disabled={busy || reasonDrafts[row.id] === undefined} onClick={() => discardReason(row.id)}>{crm.cancel}</Button>
            </div>
          </form>}
        </li>;
      })}
    </ol>
    <Button variant="outline" disabled={busy} onClick={() => void reload()}>{labels.reload}</Button>
  </section>;
}
