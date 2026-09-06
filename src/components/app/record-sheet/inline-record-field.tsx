"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import type { EntityType } from "@/lib/listing/list-state";
import { entityPaths } from "@/lib/listing/list-state";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { companyUpdateInputSchema } from "@/lib/services/companies/company-contract";
import { contactUpdateInputSchema } from "@/lib/services/contacts/contact-contract";
import { dealUpdateInputSchema } from "@/lib/services/deals/deal-contract";
import { crmRequest, requestError } from "../record-types";

export function InlineRecordField({ entity, recordId, field, value, label, labels }: { entity: EntityType; recordId: string; field: string; value: string; label: string; labels: CrmDictionary }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const committing = useRef(false);
  const control = useRef<HTMLButtonElement>(null);
  const multiline = field === "description" || field === "closedReason";
  async function save() {
    if (committing.current) return;
    const next = draft.trim();
    if (next === value) { setEditing(false); return; }
    const schema = { company: companyUpdateInputSchema, contact: contactUpdateInputSchema, deal: dealUpdateInputSchema }[entity];
    const parsed = schema.safeParse({ action: "update", data: { [field]: next || null } });
    if (!parsed.success) { setError(labels.invalid); return; }
    committing.current = true; setBusy(true); setError("");
    try { await crmRequest(`/api/crm/${entityPaths[entity]}/${recordId}`, { method: "PATCH", body: JSON.stringify(parsed.data) }); setEditing(false); invalidateCrm(entity); control.current?.focus(); }
    catch (reason) { setError(requestError(reason, labels)); }
    finally { committing.current = false; setBusy(false); }
  }
  const props = { "data-inline-record-editor": true, autoFocus: true, "aria-label": label, value: draft, disabled: busy, "aria-invalid": Boolean(error), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => { void save(); }, onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(value); setEditing(false); setError(""); } else if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); } } };
  return <div className="min-w-0">{editing ? multiline ? <Textarea {...props} rows={3} /> : <Input {...props} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} /> : <Button ref={control} type="button" variant="ghost" size="sm" className={`w-full justify-start border border-transparent px-2 font-normal hover:border-input hover:bg-muted/40 ${multiline ? "h-auto min-h-8 whitespace-pre-wrap py-1 text-left" : "h-8"}`} aria-label={`${labels.edit}: ${label}`} onClick={() => { setDraft(value); setEditing(true); }}><span className={`min-w-0 ${multiline ? "break-words" : "truncate"} ${value ? "" : "text-muted-foreground"}`}>{value || "—"}</span></Button>}{error && <p role="alert" className="px-2 text-xs text-destructive">{error}</p>}</div>;
}
