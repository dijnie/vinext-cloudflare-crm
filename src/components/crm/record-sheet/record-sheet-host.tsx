"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { changeListState, entityPaths, entityTypeSchema } from "@/crm/list-state";
import { stableIdSchema } from "@/crm/contracts/list-contract";
import { invalidateCrm } from "@/crm/invalidation";
import { getCrmDictionary } from "@/i18n/crm-dictionary";
import type { AppLocale } from "@/i18n/config";
import { EntityForm } from "../entity-form";
import { ActivityTimeline } from "../activity-timeline";
import { crmRequest, recordName, requestError, type CrmRecord } from "../record-types";
import { CompanySheet } from "./company-sheet";
import { ContactSheet } from "./contact-sheet";
import { DealSheet } from "./deal-sheet";

export function RecordSheetHost({ locale }: { locale: AppLocale }) {
  const search = useSearchParams(); const path = usePathname(); const router = useRouter(); const labels = getCrmDictionary(locale);
  const parsedType = entityTypeSchema.safeParse(search.get("recordType")); const parsedId = stableIdSchema.safeParse(search.get("recordId"));
  const entity = parsedType.success ? parsedType.data : undefined; const id = parsedId.success ? parsedId.data : undefined; const open = Boolean(entity && id && (!search.has("tab") || ["details", "activities"].includes(search.get("tab") ?? "")));
  const [result, setResult] = useState<{ key: string; record?: CrmRecord; error?: string }>({ key: "" });
  const [revision, setRevision] = useState(0); const [editing, setEditing] = useState(false); const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null); const heading = useRef<HTMLHeadingElement>(null); const key = `${entity}:${id}`;
  const record = result.key === key ? result.record : undefined; const loadError = result.key === key ? result.error : undefined;
  useEffect(() => { const invalidate = () => setRevision(value => value + 1); const capture = (event: Event) => { trigger.current = (event as CustomEvent<HTMLElement>).detail; }; window.addEventListener("crm:invalidate", invalidate); window.addEventListener("crm:record-trigger", capture); return () => { window.removeEventListener("crm:invalidate", invalidate); window.removeEventListener("crm:record-trigger", capture); }; }, []);
  useEffect(() => { setEditing(false); setConfirming(false); setError(""); if (!entity || !id) return; const controller = new AbortController(); setResult(previous => previous.key === key ? previous : { key }); crmRequest<CrmRecord>(`/api/crm/${entityPaths[entity]}/${id}`, { signal: controller.signal }).then(value => setResult({ key, record: value })).catch(reason => { if (!controller.signal.aborted) setResult({ key, error: reason instanceof Error && reason.message === "404" ? labels.missing : labels.error }); }); return () => controller.abort(); }, [entity, id, revision, labels]);
  useEffect(() => { if (open) heading.current?.focus(); }, [key, Boolean(record), open]);
  function close() { router.push(`${path}?${changeListState(new URLSearchParams(search.toString()), { recordType: null, recordId: null, tab: null })}`, { scroll: false }); }
  async function archive() { if (!entity || !id || !record) return; setBusy(true); setError(""); try { await crmRequest(`/api/crm/${entityPaths[entity]}/${id}`, { method: "PATCH", body: JSON.stringify({ action: record.archivedAt ? "restore" : "archive" }) }); setConfirming(false); invalidateCrm(entity); } catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); } }
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) close(); }}><DialogContent variant="sheet" closeLabel={labels.close} onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); const target = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>("[data-list-heading]") || document.getElementById("main-content"); target?.focus(); }}>
    <div className="shrink-0 space-y-3 border-b p-5 pr-14"><DialogTitle ref={heading} tabIndex={-1}>{record ? recordName(record) : loadError ?? labels.loading}</DialogTitle><DialogDescription>{entity ? labels[entity] : labels.details}</DialogDescription>{record?.archivedAt && <Badge variant="secondary">{labels.archived}</Badge>}{record && !editing && <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}>{labels.edit}</Button><Button variant="outline" className="min-h-11" onClick={() => setConfirming(true)}>{record.archivedAt ? labels.restore : labels.archive}</Button></div>}</div>
    <div className="min-h-0 flex-1 overflow-auto p-5">{!record && !loadError && <p role="status">{labels.loading}</p>}{loadError && <div role="alert" className="space-y-3"><p>{loadError}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.retry}</Button></div>}{record && entity && (editing ? <EntityForm key={key} entity={entity} record={record} labels={labels} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} /> : <><nav aria-label={labels.details} className="mb-5 flex gap-2 border-b">{(["details", "activities"] as const).map(tab => <Button key={tab} variant="ghost" aria-current={(search.get("tab") ?? "details") === tab ? "page" : undefined} onClick={() => router.push(`${path}?${changeListState(new URLSearchParams(search.toString()), { tab })}`, { scroll: false })}>{labels[tab]}</Button>)}</nav>{search.get("tab") === "activities" ? <ActivityTimeline key={key} entity={entity} recordId={record.id} locale={locale} labels={labels} /> : entity === "company" ? <CompanySheet record={record} locale={locale} labels={labels} /> : entity === "contact" ? <ContactSheet record={record} locale={locale} labels={labels} /> : <DealSheet record={record} locale={locale} labels={labels} />}</>)}</div>
    <Dialog open={confirming} onOpenChange={value => { if (!busy) setConfirming(value); }}><DialogContent closeLabel={labels.close}><DialogTitle>{record?.archivedAt ? labels.restore : labels.archive}</DialogTitle><DialogDescription>{record?.archivedAt ? labels.restoreConfirm : labels.archiveConfirm}</DialogDescription>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>{labels.cancel}</Button><Button disabled={busy} onClick={archive}>{busy ? labels.loading : labels.confirm}</Button></div></DialogContent></Dialog>
  </DialogContent></Dialog>;
}
