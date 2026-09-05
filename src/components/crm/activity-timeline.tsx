"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ActivityEntry, TimelineInput } from "@/modules/crm/contracts/activity-contract";
import { invalidateCrm } from "@/modules/crm/invalidation";
import type { EntityType } from "@/modules/crm/list-state";
import type { AppLocale } from "@/i18n/config";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import { ActivityComposer } from "./activity-composer";
import { selectClass } from "./list-toolbar";
import { crmRequest, requestError } from "./record-types";

export function ActivityTimeline({ entity, recordId, locale, labels }: { entity: EntityType; recordId: string; locale: AppLocale; labels: CrmDictionary }) {
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
    setBusyId(entry.id); setError("");
    try { await crmRequest(`/api/crm/activities/${entry.id}`, { method: "PATCH", body: JSON.stringify({ completed: !entry.completedAt }) }); invalidateCrm("activity"); }
    catch (reason) { setError(requestError(reason, labels)); } finally { setBusyId(undefined); }
  }
  const time = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <section className="space-y-5" aria-label={labels.activities}>
    <ActivityComposer entity={entity} recordId={recordId} labels={labels} />
    <div className="space-y-1"><label htmlFor="activity-filter" className="text-sm font-medium">{copy.filter}</label><select id="activity-filter" className={`${selectClass} w-full`} value={filter} onChange={event => { setCursor(undefined); setFilter(event.target.value as TimelineInput["filter"]); }}>{Object.entries(copy.filters).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>
    {error && <div role="alert" className="text-sm text-destructive">{error}<Button variant="ghost" onClick={() => { setCursor(undefined); setRevision(value => value + 1); }}>{labels.retry}</Button></div>}
    <ol className="space-y-3" aria-busy={loading}>{entries.map(entry => <li key={entry.id} className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{entry.subject || copy.types[entry.type]}</h3><span className="text-xs text-muted-foreground">{copy.types[entry.type]}</span></div>
      <p className="text-xs text-muted-foreground">{copy.author}: {entry.author.name || entry.author.email} · <time dateTime={entry.occurredAt ?? entry.createdAt}>{time(entry.occurredAt ?? entry.createdAt)}</time></p>
      {entry.metadata && <p className="text-sm">{copy.stageChange}: {labels.stages[entry.metadata.fromStageId]} → {labels.stages[entry.metadata.toStageId]}</p>}
      {entry.content && <p className="whitespace-pre-wrap break-words text-sm">{entry.content}</p>}
      {entry.dueAt && <p className="text-sm">{copy.dueAt}: <time dateTime={entry.dueAt}>{time(entry.dueAt)}</time></p>}
      {entry.completedAt && <p className="text-sm">{copy.completedAt}: <time dateTime={entry.completedAt}>{time(entry.completedAt)}</time></p>}
      {entry.type === "task" && <Button variant="outline" className="min-h-11" disabled={Boolean(busyId)} onClick={() => void complete(entry)}>{busyId === entry.id ? labels.loading : entry.completedAt ? copy.reopen : copy.complete}</Button>}
    </li>)}</ol>
    {loading && <p role="status" className="text-sm">{labels.loading}</p>}{!loading && !error && !entries.length && <p className="text-sm text-muted-foreground">{copy.empty}</p>}
    {data.key === key && data.nextCursor && <Button variant="outline" disabled={loading} onClick={() => setCursor(data.nextCursor ?? undefined)}>{copy.more}</Button>}
  </section>;
}
