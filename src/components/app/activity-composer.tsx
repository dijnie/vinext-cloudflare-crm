"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { activityCreateInputSchema, type ActivityCreateInput } from "@/lib/services/activities/activity-contract";
import { invalidateCrm } from "@/lib/listing/invalidation";
import type { EntityType } from "@/lib/listing/list-state";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { Document, Phone, Events, Checkbox } from "@carbon/icons-react";
import { crmRequest, requestError } from "./record-types";

export function ActivityComposer({ entity, recordId, labels, disabled = false }: { entity: EntityType; recordId: string; labels: CrmDictionary; disabled?: boolean }) {
  const submitting = useRef(false);
  const [type, setType] = useState<ActivityCreateInput["type"]>("note");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}); const form = useRef<HTMLFormElement>(null);
  const [owners,setOwners]=useState<{membershipId:string;name:string;email:string}[]>([]);
  useEffect(()=>{if(type!=="task"||owners.length)return;const controller=new AbortController();void crmRequest<{rows:typeof owners}>("/api/crm/owners",{signal:controller.signal}).then(data=>setOwners(data.rows)).catch(()=>{});return()=>controller.abort();},[type,owners.length]);
  const copy = labels.activity;
  async function submit() {
    if (disabled || submitting.current || !form.current || !form.current.reportValidity()) return;
    const values = new FormData(form.current); setError(""); setErrors({}); setSaved(false);
    const date = (key: string) => { const raw = String(values.get(key) ?? ""); return raw ? new Date(raw).toISOString() : undefined; };
    const parsed = activityCreateInputSchema.safeParse({ type, [`${entity}Id`]: recordId, subject: String(values.get("subject") ?? "") || null, content: String(values.get("content") ?? "") || null, occurredAt: date("occurredAt"), ...(type === "task" ? { dueAt: date("dueAt"),assigneeMembershipId:String(values.get("assigneeMembershipId")??"")||undefined } : {}) });
    if (!parsed.success) { const next = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path.at(-1)), labels.invalid])); setErrors(next); setError(labels.invalid); const first = Object.keys(next)[0]; if (first) form.current.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    submitting.current = true; setBusy(true);
    try { await crmRequest("/api/crm/activities", { method: "POST", body: JSON.stringify(parsed.data) }); form.current?.reset(); setType("note"); setSaved(true); invalidateCrm("activity"); }
    catch (reason) { setError(requestError(reason, labels)); } finally { submitting.current = false; setBusy(false); }
  }
  const icons = { note: Document, call: Phone, meeting: Events, task: Checkbox };
  return <form ref={form} className="space-y-2" onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } }}>
    <div className="overflow-hidden rounded-lg border bg-background">
      <label className="sr-only" htmlFor={type === "task" ? "activity-subject" : "activity-content"}>{type === "task" ? copy.subject : copy.content}</label>
      {type === "task" ? <Input key="task-subject" id="activity-subject" name="subject" placeholder={copy.subject} maxLength={300} required disabled={busy || disabled} aria-invalid={Boolean(errors.subject)} /> : <Textarea key="activity-body" id="activity-content" name="content" placeholder={copy.add} maxLength={10000} disabled={busy || disabled} className="min-h-24 resize-y rounded-none border-0 shadow-none focus-visible:ring-0" />}
      <div className="flex flex-wrap items-center gap-1 border-t p-2" role="group" aria-label={copy.type}>{(["note", "call", "meeting", "task"] as const).map(value => { const Icon = icons[value]; return <Button type="button" key={value} size="sm" variant={type === value ? "secondary" : "ghost"} aria-pressed={type === value} onClick={() => { setType(value); setErrors({}); }} disabled={busy || disabled}><Icon size={14} />{copy.types[value]}</Button>; })}<Button type="submit" size="sm" disabled={busy || disabled} className="ml-auto">{busy ? labels.loading : labels.save}</Button></div>
    </div>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1">{labels.details}</summary><div className="space-y-3 py-2">
      {type === "task" ? <div className="space-y-1"><label htmlFor="activity-content">{copy.content}</label><Textarea id="activity-content" name="content" maxLength={10000} disabled={busy || disabled} /></div> : <div className="space-y-1"><label htmlFor="activity-subject">{copy.subject}</label><Input id="activity-subject" name="subject" maxLength={300} disabled={busy || disabled} aria-invalid={Boolean(errors.subject)} /></div>}
      <div className="grid gap-3 sm:grid-cols-2">{(["occurredAt", ...(type === "task" ? ["dueAt"] : [])] as Array<"occurredAt" | "dueAt">).map(key => <div className="space-y-1" key={key}><label htmlFor={`activity-${key}`}>{copy[key]}</label><Input id={`activity-${key}`} name={key} type="datetime-local" disabled={busy || disabled} aria-invalid={Boolean(errors[key])} />{errors[key] && <p className="text-destructive">{errors[key]}</p>}</div>)}{type==="task"&&<div className="space-y-1"><label htmlFor="activity-assignee">{copy.assignee}</label><select id="activity-assignee" name="assigneeMembershipId" className="h-9 w-full rounded-md border bg-background px-3" disabled={busy||disabled}><option value="">{copy.me}</option>{owners.map(owner=><option key={owner.membershipId} value={owner.membershipId}>{owner.name||owner.email}</option>)}</select></div>}</div>
    </div></details>
    {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}{saved && <p role="status" className="text-xs">{copy.saved}</p>}
  </form>;
}
