"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEAL_STAGE_IDS, dealCreateInputSchema, dealUpdateInputSchema } from "@/crm/contracts/deal-contract";
import { companyCreateInputSchema, companyUpdateInputSchema } from "@/crm/contracts/company-contract";
import { contactCreateInputSchema, contactUpdateInputSchema } from "@/crm/contracts/contact-contract";
import { membershipIdSchema } from "@/crm/contracts/list-contract";
import { entityPaths, type EntityType } from "@/crm/list-state";
import { invalidateCrm } from "@/crm/invalidation";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import { crmRequest, fieldLabel, requestError, type CrmRecord, type ListData } from "./record-types";
import { selectClass } from "./list-toolbar";

const createFields = { company: ["name", "domain", "ownerMembershipId"], contact: ["firstName", "lastName", "email", "phone", "title", "companyId", "ownerMembershipId"], deal: ["name", "companyId", "ownerMembershipId", "stageId", "amountMinor", "currency", "expectedCloseAt"] };
const editFields = { company: ["name", "domain", "website", "description", "industry", "city", "countryCode", "phone", "email", "ownerMembershipId"], contact: createFields.contact, deal: [...createFields.deal, "description", "closedReason"] };
export function EntityForm({ entity, record, labels, onSaved, onCancel }: { entity: EntityType; record?: CrmRecord; labels: CrmDictionary; onSaved: (id: string) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({});
  const [owners, setOwners] = useState<Array<{ membershipId: string; name: string | null; email: string | null }>>([]);
  const [selectedOwner, setSelectedOwner] = useState<(typeof owners)[number] | null>(() => {
    if (record?.owner) return record.owner;
    const fallback = membershipIdSchema.safeParse(record?.ownerMembershipId);
    return fallback.success ? { membershipId: fallback.data, name: null, email: null } : null;
  });
  const ownerOptions = [...new Map([
    ...(record?.owner ? [[record.owner.membershipId, record.owner] as const] : []),
    ...(selectedOwner ? [[selectedOwner.membershipId, selectedOwner] as const] : []),
    ...owners.map(owner => [owner.membershipId, owner] as const),
  ]).values()];
  const [companies, setCompanies] = useState<CrmRecord[]>([]); const [companySearch, setCompanySearch] = useState(""); const [optionsError, setOptionsError] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string | null } | null>(record?.company ?? null);
  const companyOptions = [...new Map([
    ...companies.map(company => [company.id, { id: company.id, name: company.name ?? null }] as const),
    ...(record?.company ? [[record.company.id, record.company] as const] : []),
    ...(selectedCompany ? [[selectedCompany.id, selectedCompany] as const] : []),
  ]).values()];
  useEffect(() => { const controller = new AbortController(); crmRequest<{ rows: typeof owners }>("/api/crm/owners", { signal: controller.signal }).then(data => setOwners(data.rows)).catch(() => { if (!controller.signal.aborted) setOptionsError(true); }); return () => controller.abort(); }, []);
  useEffect(() => { if (entity === "company") return; const controller = new AbortController(); const timer = setTimeout(() => { crmRequest<ListData>(`/api/crm/companies?pageSize=100&q=${encodeURIComponent(companySearch)}`, { signal: controller.signal }).then(data => { setCompanies(data.rows); setOptionsError(false); }).catch(() => { if (!controller.signal.aborted) setOptionsError(true); }); }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [entity, companySearch]);
  async function submit(form: HTMLFormElement) {
    setError(""); setErrors({}); const data: Record<string, unknown> = {}; const formData = new FormData(form);
    for (const key of record ? editFields[entity] : createFields[entity]) {
      const raw = String(formData.get(key) ?? "").trim();
      data[key] = key === "amountMinor" ? raw === "" ? null : Number(raw) : key === "expectedCloseAt" ? raw ? new Date(`${raw}T00:00:00Z`).toISOString() : null : raw === "" ? (record || key === "companyId" || key === "ownerMembershipId" ? null : undefined) : raw;
    }
    const schema = record ? { company: companyUpdateInputSchema, contact: contactUpdateInputSchema, deal: dealUpdateInputSchema }[entity] : { company: companyCreateInputSchema, contact: contactCreateInputSchema, deal: dealCreateInputSchema }[entity];
    const parsed = schema.safeParse(record ? { action: "update", data } : data);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path.at(-1)), labels.invalid]))); setError(labels.invalid); return; }
    setBusy(true);
    try { const saved = await crmRequest<{ id: string }>(`/api/crm/${entityPaths[entity]}${record ? `/${record.id}` : ""}`, { method: record ? "PATCH" : "POST", body: JSON.stringify(parsed.data) }); invalidateCrm(entity); onSaved(saved.id); }
    catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(event.currentTarget); }}>
    {optionsError && <p role="alert" className="text-sm text-destructive">{labels.error}</p>}
    {(record ? editFields[entity] : createFields[entity]).map(key => { const id = `record-${key}`; const required = key === "name" || key === "firstName" || entity === "deal" && ["companyId", "ownerMembershipId", "currency", "stageId"].includes(key); const initial = String(record?.[key] ?? (key === "currency" ? "USD" : key === "stageId" ? "demo-booked" : ""));
      return <div key={key} className="space-y-1"><label className="text-sm font-medium" htmlFor={id}>{fieldLabel(key, labels)}{required ? " *" : ""}</label>
      {key === "companyId" ? <><Input aria-label={labels.chooseCompany} value={companySearch} onChange={event => setCompanySearch(event.target.value)} className="min-h-11" /><select className={`${selectClass} w-full`} id={id} name={key} required={required} value={selectedCompany?.id ?? ""} onChange={event => setSelectedCompany(companyOptions.find(company => company.id === event.target.value) ?? null)}><option value="">{labels.none}</option>{companyOptions.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}</select></> : key === "ownerMembershipId" ? <select className={`${selectClass} w-full`} id={id} name={key} required={required} value={selectedOwner?.membershipId ?? ""} onChange={event => setSelectedOwner(ownerOptions.find(owner => owner.membershipId === event.target.value) ?? null)}><option value="">{labels.none}</option>{ownerOptions.map(owner => <option value={owner.membershipId} key={owner.membershipId}>{owner.name || owner.email || owner.membershipId}</option>)}</select> : key === "stageId" ? <select className={`${selectClass} w-full`} name={key} id={id} defaultValue={initial}>{DEAL_STAGE_IDS.map(stage => <option key={stage} value={stage}>{labels.stages[stage]}</option>)}</select> : ["description", "closedReason"].includes(key) ? <Textarea id={id} name={key} defaultValue={initial} /> : <Input id={id} name={key} className="min-h-11" defaultValue={key === "expectedCloseAt" ? initial.slice(0, 10) : initial} required={required} type={key === "email" ? "email" : key === "amountMinor" ? "number" : key === "expectedCloseAt" ? "date" : "text"} min={key === "amountMinor" ? 0 : undefined} step={key === "amountMinor" ? 1 : undefined} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-error` : undefined} />}
      {key === "amountMinor" && <p className="text-xs text-muted-foreground">{labels.currencyHelp}</p>}{errors[key] && <p className="text-sm text-destructive" id={`${id}-error`}>{errors[key]}</p>}</div>;
    })}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{labels.cancel}</Button><Button type="submit" disabled={busy}>{busy ? labels.loading : labels.save}</Button></div>
  </form>;
}
