"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { activityCreateInputSchema, type ActivityCreateInput } from "@/lib/services/activities/activity-contract";
import { invalidateCrm } from "@/lib/listing/invalidation";
import type { EntityType } from "@/lib/listing/list-state";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { selectClass } from "./list-toolbar";
import { crmRequest, requestError } from "./record-types";

export function ActivityComposer({ entity, recordId, labels }: { entity: EntityType; recordId: string; labels: CrmDictionary }) {
  const [type, setType] = useState<ActivityCreateInput["type"]>("note");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}); const form = useRef<HTMLFormElement>(null);
  const copy = labels.activity;
  async function submit() {
    if (!form.current) return;
    const values = new FormData(form.current); setError(""); setErrors({}); setSaved(false);
    const date = (key: string) => { const raw = String(values.get(key) ?? ""); return raw ? new Date(raw).toISOString() : undefined; };
    const parsed = activityCreateInputSchema.safeParse({ type, [`${entity}Id`]: recordId, subject: String(values.get("subject") ?? "") || null, content: String(values.get("content") ?? "") || null, occurredAt: date("occurredAt"), ...(type === "task" ? { dueAt: date("dueAt") } : {}) });
    if (!parsed.success) { const next = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path.at(-1)), labels.invalid])); setErrors(next); setError(labels.invalid); const first = Object.keys(next)[0]; if (first) form.current.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    setBusy(true);
    try { await crmRequest("/api/crm/activities", { method: "POST", body: JSON.stringify(parsed.data) }); form.current?.reset(); setType("note"); setSaved(true); invalidateCrm("activity"); }
    catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); }
  }
  return <form ref={form} className="space-y-3 rounded-lg border p-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3 className="font-medium">{copy.add}</h3>
    <div className="space-y-1"><label htmlFor="activity-type" className="text-sm">{copy.type}</label><select id="activity-type" className={`${selectClass} w-full`} value={type} onChange={event => { setType(event.target.value as ActivityCreateInput["type"]); setErrors({}); }} disabled={busy}>{(["note", "call", "meeting", "task"] as const).map(value => <option key={value} value={value}>{copy.types[value]}</option>)}</select></div>
    <div className="space-y-1"><label htmlFor="activity-subject" className="text-sm">{copy.subject}{type === "task" ? " *" : ""}</label><Input id="activity-subject" name="subject" maxLength={300} required={type === "task"} disabled={busy} aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? "activity-subject-error" : undefined} />{errors.subject && <p id="activity-subject-error" className="text-sm text-destructive">{errors.subject}</p>}</div>
    <div className="space-y-1"><label htmlFor="activity-content" className="text-sm">{copy.content}</label><Textarea id="activity-content" name="content" maxLength={10000} disabled={busy} /></div>
    <div className="grid gap-3 sm:grid-cols-2">{(["occurredAt", ...(type === "task" ? ["dueAt"] : [])] as Array<"occurredAt" | "dueAt">).map(key => <div className="space-y-1" key={key}><label className="text-sm" htmlFor={`activity-${key}`}>{copy[key]}</label><Input id={`activity-${key}`} name={key} type="datetime-local" disabled={busy} aria-invalid={Boolean(errors[key])} />{errors[key] && <p className="text-sm text-destructive">{errors[key]}</p>}</div>)}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{saved && <p role="status" className="text-sm">{copy.saved}</p>}
    <Button type="submit" disabled={busy} className="min-h-11">{busy ? labels.loading : labels.save}</Button>
  </form>;
}
