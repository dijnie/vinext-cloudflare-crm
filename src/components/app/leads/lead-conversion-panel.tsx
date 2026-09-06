"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getLeadDictionary } from "@/lib/i18n/lead-dictionary";
import type { leadConversionPreviewSchema, LeadConversionRequest, LeadConversionResult } from "@/lib/services/conversions/lead-conversion-contracts";
import { contactCreateInputSchema } from "@/lib/services/contacts/contact-contract";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { EntityForm } from "../entity-form";
import { useModules } from "../module-provider";
import { crmRequest, recordName, requestError, type CrmRecord, type ListData } from "../record-types";
import { RecordLink } from "../record-sheet/record-link";
type Preview = z.infer<typeof leadConversionPreviewSchema>;
export function LeadConversionPanel({ record, locale }: { record: CrmRecord; locale: AppLocale }) {
  const labels = getLeadDictionary(locale), crm = getCrmDictionary(locale), modules = useModules();
  const [preview, setPreview] = useState<Preview>(); const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "link">("create"); const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<CrmRecord[]>([]); const [selected, setSelected] = useState<CrmRecord>();
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [result, setResult] = useState<LeadConversionResult>();
  const [revision, setRevision] = useState(0); const pending = useRef<LeadConversionRequest | null>(null);
  const enabled = modules.isEnabled("lead") && modules.isEnabled("contact") && !record.archivedAt;
  useEffect(() => {
    if (!open || mode !== "link") return;
    const controller = new AbortController(); const timer = setTimeout(() => {
      void crmRequest<ListData>(`/api/crm/contacts?pageSize=30&q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setContacts(data.rows); setError(""); } }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason, crm)); });
    }, 250); return () => { controller.abort(); clearTimeout(timer); };
  }, [open, mode, query, crm]);
  async function load() {
    setBusy(true); setError("");
    try { const next = await crmRequest<Preview>(`/api/crm/leads/${record.id}/conversion-preview`, { method: "POST", body: "{}" }); setPreview(next); setOpen(true); if (!preview) setRevision(value => value + 1); pending.current = null; if (next.conversion) setResult(next.conversion); }
    catch (reason) { setError(requestError(reason, crm)); } finally { setBusy(false); }
  }
  async function apply(target?: LeadConversionRequest["target"]): Promise<{ id: string }> {
    if (!preview || !enabled && !pending.current) throw new Error("409");
    const request = pending.current ?? { operationKey: crypto.randomUUID(), expectedLeadRevision: preview.leadRevision, expectedLeadValueRevision: preview.leadValueRevision, expectedMappingRevision: preview.mappingRevision, expectedLeadFieldRevision: preview.leadFieldRevision, expectedContactFieldRevision: preview.contactFieldRevision, target: target! };
    if (!request.target) throw new Error("400");
    pending.current = request; setBusy(true); setError("");
    try { const saved = await crmRequest<LeadConversionResult>(`/api/crm/leads/${record.id}/convert`, { method: "POST", body: JSON.stringify(request) }); setResult(saved); setOpen(false); pending.current = null; invalidateCrm("lead"); invalidateCrm("contact"); return { id: saved.contactId }; }
    catch (reason) { setError(requestError(reason, crm)); throw reason; } finally { setBusy(false); }
  }
  const contactId = result?.contactId ?? (typeof record.convertedContactId === "string" ? record.convertedContactId : null);
  return <section className="space-y-3 border-b p-5"><h3 className="text-sm font-medium">{labels.history}</h3>{contactId ? <div className="space-y-2"><p>{labels.conversionSaved}: <RecordLink entity="contact" id={contactId}>{crm.contact}</RecordLink></p><p className="text-xs text-muted-foreground">{labels.retainedFiles}</p>{(result?.convertedAt || typeof record.convertedAt === "string") && <time className="text-xs" dateTime={result?.convertedAt ?? String(record.convertedAt)}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(result?.convertedAt ?? String(record.convertedAt)))}</time>}</div> : <><p className="text-sm text-muted-foreground">{labels.noHistory}</p>{!open && <Button disabled={busy || !enabled} onClick={() => void load()}>{busy ? crm.loading : labels.convert}</Button>}</>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {open && preview && !contactId && <div className="space-y-4"><h4 className="font-medium">{labels.preview}</h4><p className="text-sm text-muted-foreground">{labels.duplicateHelp}</p>{preview.candidates.length > 0 && <div className="space-y-2"><h5 className="text-sm font-medium">{labels.duplicates}</h5><ul className="space-y-2">{preview.candidates.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm"><RecordLink entity="contact" id={item.id}>{recordName(item)}</RecordLink><span>{item.email || item.phone}</span><Button size="sm" variant="outline" disabled={busy || Boolean(pending.current)} onClick={() => { setMode("link"); setSelected(item); }}>{labels.choose}</Button></li>)}</ul></div>}
      <div className="flex flex-wrap gap-2">{(["create", "link"] as const).map(value => <Button key={value} variant={mode === value ? "default" : "outline"} disabled={busy || Boolean(pending.current)} onClick={() => setMode(value)}>{labels[value]}</Button>)}</div>
      {pending.current && <div className="space-y-2"><Button disabled={busy} onClick={() => void apply().catch(() => {})}>{labels.retry}</Button><Button variant="outline" disabled={busy} onClick={() => void load()}>{labels.refresh}</Button></div>}{mode === "create" ? <><p className="text-xs text-muted-foreground">{labels.retainedFiles}</p>{preview.errors.length > 0 && <p className="text-sm" role="status">{crm.invalid}: {[...new Set(preview.errors.map(issue => issue.field.startsWith("custom:") || issue.field.startsWith("customFields") ? crm.fields : crm.labels[issue.field.replace(/^builtin:/, "") as keyof typeof crm.labels] ?? crm.contact))].join(", ")}</p>}<EntityForm key={revision} entity="contact" labels={crm} initialValues={preview.proposedContact} readOnly={!enabled || busy || Boolean(pending.current)} submitCreate={async data => { const { draftId, ...contact } = data; return apply({ mode: "create", contact: contactCreateInputSchema.parse(contact), ...(typeof draftId === "string" ? { draftId } : {}) }); }} onSaved={() => setOpen(false)} onCancel={() => setOpen(false)} /></> : <div className="space-y-3"><label className="block text-sm">{labels.selectContact}<Input value={query} onChange={event => setQuery(event.target.value)} disabled={busy} /></label>{selected && <p className="text-sm">{crm.selected}: {recordName(selected)}</p>}<ul className="max-h-64 space-y-1 overflow-auto">{contacts.map(item => <li key={item.id}><Button variant={selected?.id === item.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal text-left" disabled={busy} onClick={() => setSelected(item)}>{recordName(item)} · {String(item.email ?? item.phone ?? "")}</Button></li>)}</ul><div className="flex gap-2"><Button disabled={!selected || busy || !enabled || Boolean(pending.current)} onClick={() => selected && void apply({ mode: "link", contactId: selected.id }).catch(() => {})}>{labels.link}</Button><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{crm.cancel}</Button></div></div>}
    </div>}
  </section>;
}
