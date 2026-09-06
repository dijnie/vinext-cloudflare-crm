"use client";
import { useDealStages } from "./deal-stage-provider";
import { useModules } from "./module-provider";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ActivityEntry, TimelineInput } from "@/lib/services/activities/activity-contract";
import { invalidateCrm } from "@/lib/listing/invalidation";
import type { EntityType } from "@/lib/listing/list-state";
import type { AppLocale } from "@/lib/i18n/config";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { ActivityComposer } from "./activity-composer";
import { FormSelect } from "./record-sheet/form-select";
import { Document, Phone, Events, Checkbox, ArrowsHorizontal, Checkmark } from "@carbon/icons-react";
import { crmRequest, requestError } from "./record-types";

export function ActivityTimeline({ entity, recordId, companyId, locale, labels }: { entity: EntityType; recordId: string; companyId?: string; locale: AppLocale; labels: CrmDictionary }) {
  const stageCatalog = useDealStages();
  const modules = useModules();
  const canCompose = modules.isEnabled(entity) && (!companyId || modules.isEnabled("company"));
  const canChange = (entry: ActivityEntry) => (!entry.companyId || modules.isEnabled("company")) && (!entry.contactId || modules.isEnabled("contact")) && (!entry.dealId || modules.isEnabled("deal"));
  const [filter, setFilter] = useState<TimelineInput["filter"]>("all");
  const [cursor, setCursor] = useState<string>(); const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ key: string; entries: ActivityEntry[]; nextCursor: string | null }>({ key: "", entries: [], nextCursor: null });
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [busyId, setBusyId] = useState<string>();
  const key = `${entity}:${recordId}:${filter}`; const copy = labels.activity;
  const entries = data.key === key ? data.entries : [];
  useEffect(() => { const refresh = (event: Event) => { const surfaces = (event as CustomEvent<{ surfaces: readonly string[] }>).detail?.surfaces; if (!surfaces || surfaces.includes("timeline")) { setCursor(undefined); setRevision(value => value + 1); } }; window.addEventListener("crm:invalidate", refresh); return () => window.removeEventListener("crm:invalidate", refresh); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    const query = new URLSearchParams({ entity, recordId, filter, limit: "30", ...(cursor ? { cursor } : {}) });
    crmRequest<{ entries: ActivityEntry[]; nextCursor: string | null }>(`/api/crm/activities?${query}`, { signal: controller.signal }).then(result => setData(previous => ({ key, nextCursor: result.nextCursor, entries: cursor && previous.key === key ? [...new Map([...previous.entries, ...result.entries].map(entry => [entry.id, entry])).values()] : result.entries }))).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason, labels)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [entity, recordId, filter, cursor, revision, key, labels]);
  async function complete(entry: ActivityEntry) {
    if (!canChange(entry)) return;
    setBusyId(entry.id); setError("");
    try { await crmRequest(`/api/crm/activities/${entry.id}`, { method: "PATCH", body: JSON.stringify({ completed: !entry.completedAt }) }); invalidateCrm("activity"); }
    catch (reason) { setError(requestError(reason, labels)); } finally { setBusyId(undefined); }
  }
  const time = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <section className="space-y-5" aria-label={labels.activities}>
    {!canCompose && <p role="status" className="text-sm text-muted-foreground">{modules.labels.activityReadOnly}</p>}
    <ActivityComposer disabled={!canCompose} entity={entity} recordId={recordId} labels={labels} />
    <div className="flex items-center justify-between gap-3 border-b pb-2"><label htmlFor="activity-filter" className="text-xs font-medium text-muted-foreground">{copy.filter}</label><div className="w-44"><FormSelect id="activity-filter" value={filter} onValueChange={value => { setCursor(undefined); setFilter(value as TimelineInput["filter"]); }} options={Object.entries(copy.filters).map(([value, label]) => ({ value, label }))} /></div></div>
    {error && <div role="alert" className="text-sm text-destructive">{error}<Button variant="ghost" onClick={() => { setCursor(undefined); setRevision(value => value + 1); }}>{labels.retry}</Button></div>}
    <ol aria-busy={loading}>{entries.map(entry => { const Icon = entry.type === "call" ? Phone : entry.type === "meeting" ? Events : entry.type === "task" ? entry.completedAt ? Checkmark : Checkbox : entry.metadata ? ArrowsHorizontal : Document; return <li key={entry.id} className="relative ml-3 space-y-2 border-l pb-6 pl-7"><span className="absolute -left-3 top-0 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground" aria-hidden="true"><Icon size={14} /></span>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-medium">{entry.subject || copy.types[entry.type]}</h3><span className="text-xs text-muted-foreground">{copy.types[entry.type]}</span></div>
      <p className="text-xs text-muted-foreground">{copy.author}: {entry.author.name || entry.author.email} · <time dateTime={entry.occurredAt ?? entry.createdAt}>{time(entry.occurredAt ?? entry.createdAt)}</time></p>
      {entry.metadata && <p className="text-xs">{copy.stageChange}: {stageCatalog.label(entry.metadata.fromStageId)} → {stageCatalog.label(entry.metadata.toStageId)}</p>}
      {entry.content && <p className="whitespace-pre-wrap break-words text-xs leading-5">{entry.content}</p>}
      {entry.dueAt && <p className="text-xs">{copy.dueAt}: <time dateTime={entry.dueAt}>{time(entry.dueAt)}</time></p>}
      {entry.completedAt && <p className="text-xs">{copy.completedAt}: <time dateTime={entry.completedAt}>{time(entry.completedAt)}</time></p>}
      {entry.type === "task" && <Button variant="outline" size="sm" disabled={Boolean(busyId) || !canChange(entry)} onClick={() => void complete(entry)}>{busyId === entry.id ? labels.loading : entry.completedAt ? copy.reopen : copy.complete}</Button>}
    </li>; })}</ol>
    {loading && <p role="status" className="text-xs">{labels.loading}</p>}{!loading && !error && !entries.length && <p className="text-sm text-muted-foreground">{copy.empty}</p>}
    {data.key === key && data.nextCursor && <Button variant="outline" disabled={loading} onClick={() => setCursor(data.nextCursor ?? undefined)}>{copy.more}</Button>}
  </section>;
}
