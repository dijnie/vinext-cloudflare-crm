"use client";
import { ModuleReadOnlyBanner, useModules } from "../module-provider";
import { pushListQuery } from "../list-navigation";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Close, OverflowMenuVertical, Edit, Archive, Undo } from "@carbon/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { changeListState, entityPaths, entityTypeSchema } from "@/lib/listing/list-state";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import type { AppLocale } from "@/lib/i18n/config";
import { EntityForm } from "../entity-form";
import { ActivityTimeline } from "../activity-timeline";
import { RecordFields } from "../fields/record-fields";
import { crmRequest, displayValue, recordName, requestError, type CrmRecord } from "../record-types";
import { CompanySheet } from "./company-sheet";
import { ContactSheet } from "./contact-sheet";
import { DealSheet } from "./deal-sheet";

export function RecordSheetHost({ locale }: { locale: AppLocale }) {
  const { isEnabled } = useModules();
  const search = useSearchParams(); const path = usePathname(); const labels = getCrmDictionary(locale);
  const parsedType = entityTypeSchema.safeParse(search.get("recordType")); const parsedId = stableIdSchema.safeParse(search.get("recordId"));
  const entity = parsedType.success ? parsedType.data : undefined; const id = parsedId.success ? parsedId.data : undefined; const open = Boolean(entity && id && (!search.has("tab") || ["details", "activities", "fields"].includes(search.get("tab") ?? "")));
  const moduleEnabled = isEnabled(entity);
  const [result, setResult] = useState<{ key: string; record?: CrmRecord; error?: string }>({ key: "" });
  const [revision, setRevision] = useState(0); const [editing, setEditing] = useState(false); const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [stack, setStack] = useState<Array<{ href: string; position: number }>>([]);
  const trigger = useRef<HTMLElement | null>(null); const heading = useRef<HTMLHeadingElement>(null); const key = `${entity}:${id}`;
  const record = result.key === key ? result.record : undefined; const loadError = result.key === key ? result.error : undefined;
  useEffect(() => { const invalidate = () => setRevision(value => value + 1); const capture = (event: Event) => { trigger.current = (event as CustomEvent<HTMLElement>).detail; }; window.addEventListener("crm:invalidate", invalidate); window.addEventListener("crm:record-trigger", capture); return () => { window.removeEventListener("crm:invalidate", invalidate); window.removeEventListener("crm:record-trigger", capture); }; }, []);
  useEffect(() => { setEditing(false); setConfirming(false); setError(""); if (!entity || !id) return; const controller = new AbortController(); setResult(previous => previous.key === key ? previous : { key }); crmRequest<CrmRecord>(`/api/crm/${entityPaths[entity]}/${id}`, { signal: controller.signal }).then(value => setResult({ key, record: value })).catch(reason => { if (!controller.signal.aborted) setResult({ key, error: reason instanceof Error && reason.message === "404" ? labels.missing : labels.error }); }); return () => controller.abort(); }, [entity, id, revision, labels]);
  useEffect(() => { if (open) heading.current?.focus(); }, [key, Boolean(record), open]);
  useEffect(() => {
    const reconcile = () => {
      const stored = window.history.state?.crmRecordTrail;
      const trail = Array.isArray(stored) ? stored.filter((value: unknown): value is { href: string; position: number } => Boolean(value) && typeof value === "object" && typeof (value as { href?: unknown }).href === "string" && Number.isInteger((value as { position?: unknown }).position)) : [];
      setStack(open ? trail : []);
    };
    window.addEventListener("crm:record-nested", reconcile);
    window.addEventListener("popstate", reconcile);
    reconcile();
    return () => { window.removeEventListener("crm:record-nested", reconcile); window.removeEventListener("popstate", reconcile); };
  }, [key, open, search]);
  function back() {
    const previous = stack.at(-1);
    const position = window.history.state?.crmRecordPosition;
    if (previous && Number.isInteger(position) && position > previous.position) window.history.go(previous.position - position);
  }
  function changeTab(tab: string) {
    const position = Number.isInteger(window.history.state?.crmRecordPosition) ? window.history.state.crmRecordPosition as number : 0;
    const previous = window.location.href;
    pushListQuery(`${path}?${changeListState(new URLSearchParams(search.toString()), { tab })}`);
    if (window.location.href !== previous) window.history.replaceState({ ...window.history.state, crmRecordPosition: position + 1, crmRecordTrail: stack }, "", window.location.href);
  }
  function close() { setStack([]); pushListQuery(`${path}?${changeListState(new URLSearchParams(search.toString()), { recordType: null, recordId: null, tab: null })}`); }
  async function archive() { if (!entity || !id || !record || !moduleEnabled) return; setBusy(true); setError(""); try { await crmRequest(`/api/crm/${entityPaths[entity]}/${id}`, { method: "PATCH", body: JSON.stringify({ action: record.archivedAt ? "restore" : "archive" }) }); setConfirming(false); invalidateCrm(entity); } catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); } }
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) close(); }}><DialogContent variant="sheet" sheetSize="2xl" showCloseButton={false} closeLabel={labels.close} onEscapeKeyDown={event => { if (event.target instanceof HTMLElement && event.target.closest("[data-inline-record-editor]")) event.preventDefault(); }} onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); const target = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>("[data-list-heading]") || document.getElementById("main-content"); target?.focus(); }}>
    <div className="flex shrink-0 items-start gap-3 border-b px-5 py-3">
      {stack.length > 0 && <Button variant="ghost" size="icon-sm" aria-label={locale === "vi" ? "Quay lại" : "Back"} onClick={back}><ArrowLeft size={16} /></Button>}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-lg font-medium" aria-hidden="true">{record ? recordName(record).slice(0, 1).toUpperCase() : "—"}</div>
      <div className="min-w-0 flex-1 space-y-0.5 pt-0.5"><DialogTitle ref={heading} tabIndex={-1} className="break-words text-base leading-5">{record ? recordName(record) : loadError ?? labels.loading}</DialogTitle><DialogDescription className="break-words text-xs">{record ? [entity === "company" ? record.domain : entity === "contact" ? record.title : record.company?.name, entity === "company" ? record.city : record.email, entity === "company" ? record.industry : null].filter(value => typeof value === "string" && value).join(" · ") || labels[entity!] : entity ? labels[entity] : labels.details}</DialogDescription>{record?.archivedAt && <Badge variant="secondary">{labels.archived}</Badge>}</div>
      <div className="flex shrink-0 items-center gap-1">{record && !editing && moduleEnabled && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={locale === "vi" ? "Thao tác" : "More actions"}><OverflowMenuVertical size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setEditing(true)}><Edit size={16} />{labels.edit}</DropdownMenuItem><DropdownMenuItem onSelect={() => setConfirming(true)}>{record.archivedAt ? <Undo size={16} /> : <Archive size={16} />}{record.archivedAt ? labels.restore : labels.archive}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}<Button variant="ghost" size="icon-sm" aria-label={labels.close} disabled={busy} onClick={close}><Close size={16} /></Button></div>
    </div>
    {record && !editing && <dl className="flex shrink-0 divide-x border-b bg-muted/40">{(entity === "deal" ? [[labels.labels.amount, displayValue(record, "amount", locale, labels)], [labels.labels.stageId, displayValue(record, "stage", locale, labels)], [labels.labels.expectedCloseAt, displayValue(record, "expectedCloseAt", locale, labels)]] : [[labels.deal, String(record.deals?.filter(deal => !deal.archivedAt && !String(deal.stageId).startsWith("closed-")).length ?? 0)], [entity === "company" ? labels.contact : labels.company, entity === "company" ? String(record.contacts?.length ?? 0) : record.company?.name ?? "—"]]).concat([[labels.labels.ownerMembershipId, displayValue(record, "owner", locale, labels)]]).map(([label, value]) => <div key={label} className="flex min-w-0 flex-1 flex-col gap-1 px-5 py-2.5"><dt className="truncate text-xs leading-5 text-muted-foreground">{label}</dt><dd className="truncate text-sm font-medium leading-5 tabular-nums">{value}</dd></div>)}</dl>}
    <div className="min-h-0 flex-1 overflow-auto">{!record && !loadError && <p role="status">{labels.loading}</p>}{loadError && <div role="alert" className="space-y-3"><p>{loadError}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.retry}</Button></div>}{record && entity && <ModuleReadOnlyBanner entity={entity} />}{record && entity && (editing ? <div className="p-5"><EntityForm key={key} entity={entity} record={record} labels={labels} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} /></div> : <><nav aria-label={labels.details} className="sticky top-0 z-10 flex gap-6 border-b bg-background px-5">{(["details", "activities", "fields"] as const).map(tab => <Button key={tab} variant="ghost" className={`h-10 rounded-none border-b-2 px-0 text-xs hover:bg-transparent ${(search.get("tab") ?? "details") === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`} aria-current={(search.get("tab") ?? "details") === tab ? "page" : undefined} onClick={() => changeTab(tab)}>{labels[tab]}</Button>)}</nav>{search.get("tab") === "fields" ? <div className="p-5"><RecordFields key={key} entity={entity} recordId={record.id} labels={labels} /></div> : search.get("tab") === "activities" ? <div className="p-5"><ActivityTimeline key={key} entity={entity} recordId={record.id} companyId={record.company?.id ?? (typeof record.companyId === "string" ? record.companyId : undefined)} locale={locale} labels={labels} /></div> : entity === "company" ? <CompanySheet record={record} locale={locale} labels={labels} /> : entity === "contact" ? <ContactSheet record={record} locale={locale} labels={labels} /> : <DealSheet record={record} locale={locale} labels={labels} />}</>)}</div>
    <Dialog open={confirming} onOpenChange={value => { if (!busy) setConfirming(value); }}><DialogContent closeLabel={labels.close}><DialogTitle>{record?.archivedAt ? labels.restore : labels.archive}</DialogTitle><DialogDescription>{record?.archivedAt ? labels.restoreConfirm : labels.archiveConfirm}</DialogDescription>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>{labels.cancel}</Button><Button disabled={busy || !moduleEnabled} onClick={archive}>{busy ? labels.loading : labels.confirm}</Button></div></DialogContent></Dialog>
  </DialogContent></Dialog>;
}
