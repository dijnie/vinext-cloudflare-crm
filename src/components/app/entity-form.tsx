"use client";
import { useModules } from "./module-provider";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEAL_STAGE_IDS, dealCreateInputSchema, dealUpdateInputSchema } from "@/lib/services/deals/deal-contract";
import { companyCreateInputSchema, companyUpdateInputSchema } from "@/lib/services/companies/company-contract";
import { contactCreateInputSchema, contactUpdateInputSchema } from "@/lib/services/contacts/contact-contract";
import { membershipIdSchema } from "@/lib/listing/list-contract";
import { entityPaths, type EntityType } from "@/lib/listing/list-state";
import { invalidateCrm } from "@/lib/listing/invalidation";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { crmRequest, fieldLabel, requestError, type CrmRecord, type ListData } from "./record-types";
import { FormSelect } from "./record-sheet/form-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { ChevronDown } from "@carbon/icons-react";
import { OwnerPicker, type OwnerOption } from "./owner-picker";
import { CURRENCIES } from "@/lib/services/currencies/currency-catalog";
import type { CurrencySettings } from "@/lib/services/currencies/currency-contracts";

const createFields = { company: ["name", "domain", "ownerMembershipId"], contact: ["firstName", "lastName", "email", "phone", "title", "companyId", "ownerMembershipId"], deal: ["name", "companyId", "ownerMembershipId", "stageId", "amountMinor", "currency", "expectedCloseAt"] };
const editFields = { company: ["name", "domain", "website", "description", "industry", "city", "countryCode", "phone", "email", "ownerMembershipId"], contact: createFields.contact, deal: [...createFields.deal, "description", "closedReason"] };
export function EntityForm({ entity, record, labels, onSaved, onCancel }: { entity: EntityType; record?: CrmRecord; labels: CrmDictionary; onSaved: (id: string) => void; onCancel: () => void }) {
  const { isEnabled } = useModules();
  const moduleEnabled = isEnabled(entity);

  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({});
  const [currencyPending, setCurrencyPending] = useState(false);
  useEffect(() => {
    if (entity !== "deal") return;
    const controller = new AbortController();
    const load = () => { void crmRequest<CurrencySettings>("/api/crm/currency", { signal: controller.signal }).then(settings => { if (!controller.signal.aborted) setCurrencyPending(settings.job?.status === "pending" || settings.job?.status === "running"); }).catch(() => {}); };
    const refreshCurrency = (event: Event) => { if (event instanceof CustomEvent && event.detail?.kind === "currency") load(); };
    load(); window.addEventListener("crm:invalidate", refreshCurrency);
    return () => { controller.abort(); window.removeEventListener("crm:invalidate", refreshCurrency); };
  }, [entity]);
  const [selectedOwner, setSelectedOwner] = useState<OwnerOption | null>(() => {
    if (record?.owner) return record.owner;
    const fallback = membershipIdSchema.safeParse(record?.ownerMembershipId);
    return fallback.success ? { membershipId: fallback.data, name: null, email: null } : null;
  });
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companies, setCompanies] = useState<CrmRecord[]>([]); const [companySearch, setCompanySearch] = useState(""); const [optionsError, setOptionsError] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string | null } | null>(record?.company ?? null);
  const companyOptions = [...new Map([
    ...companies.map(company => [company.id, { id: company.id, name: company.name ?? null }] as const),
    ...(record?.company ? [[record.company.id, record.company] as const] : []),
    ...(selectedCompany ? [[selectedCompany.id, selectedCompany] as const] : []),
  ]).values()];
  useEffect(() => { if (entity === "company") return; const controller = new AbortController(); const timer = setTimeout(() => { crmRequest<ListData>(`/api/crm/companies?pageSize=100&q=${encodeURIComponent(companySearch)}`, { signal: controller.signal }).then(data => { setCompanies(data.rows); setOptionsError(false); }).catch(() => { if (!controller.signal.aborted) setOptionsError(true); }); }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [entity, companySearch]);
  async function submit(form: HTMLFormElement) {
    if (!moduleEnabled) return;
    setError(""); setErrors({}); const data: Record<string, unknown> = {}; const formData = new FormData(form);
    for (const key of record ? editFields[entity] : createFields[entity]) {
      if (record && entity === "deal" && ["amountMinor", "currency"].includes(key) && currencyPending) continue;
      const rawValue = String(formData.get(key) ?? "").trim();
      const raw = rawValue === "__unassigned__" ? "" : rawValue;
      data[key] = key === "amountMinor" ? raw === "" ? null : Number(raw) : key === "expectedCloseAt" ? raw ? new Date(`${raw}T00:00:00Z`).toISOString() : null : raw === "" ? (record || key === "companyId" || key === "ownerMembershipId" ? null : undefined) : raw;
    }
    const schema = record ? { company: companyUpdateInputSchema, contact: contactUpdateInputSchema, deal: dealUpdateInputSchema }[entity] : { company: companyCreateInputSchema, contact: contactCreateInputSchema, deal: dealCreateInputSchema }[entity];
    const parsed = schema.safeParse(record ? { action: "update", data } : data);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path.at(-1)), labels.invalid]))); setError(labels.invalid); return; }
    setBusy(true);
    try { const saved = await crmRequest<{ id: string }>(`/api/crm/${entityPaths[entity]}${record ? `/${record.id}` : ""}`, { method: record ? "PATCH" : "POST", body: JSON.stringify(parsed.data) }); invalidateCrm(entity); if (record && selectedOwner?.membershipId !== record.owner?.membershipId) invalidateCrm("ownership"); onSaved(saved.id); }
    catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); }
  }
  return <form className="flex min-h-full flex-col gap-5" onSubmit={event => { event.preventDefault(); void submit(event.currentTarget); }}>
    {entity === "deal" && currencyPending && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{labels.currencyPending}</p>}
    {optionsError && <p role="alert" className="text-sm text-destructive">{labels.error}</p>}
    {(record ? editFields[entity] : createFields[entity]).map(key => { const id = `record-${key}`; const required = key === "name" || key === "firstName" || entity === "deal" && ["companyId", "ownerMembershipId", "currency", "stageId"].includes(key); const initial = String(record?.[key] ?? (key === "currency" ? "USD" : key === "stageId" ? "demo-booked" : ""));
      return <div key={key} className="space-y-2"><label className="text-xs font-medium" htmlFor={id}>{fieldLabel(key, labels)}{required ? " *" : ""}</label>
      {key === "companyId" ? <><input type="hidden" name={key} value={selectedCompany?.id ?? ""} /><Popover open={companyOpen} onOpenChange={setCompanyOpen}><PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-expanded={companyOpen} className="w-full justify-between font-normal" disabled={!moduleEnabled || busy}>{selectedCompany?.name || labels.chooseCompany}<ChevronDown size={16} /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command shouldFilter={false}><CommandInput placeholder={labels.chooseCompany} value={companySearch} onValueChange={setCompanySearch} /><CommandList><CommandEmpty>{optionsError ? labels.error : labels.none}</CommandEmpty>{!required && <CommandItem value="none" onSelect={() => { setSelectedCompany(null); setCompanyOpen(false); }}>{labels.none}</CommandItem>}{companyOptions.map(company => <CommandItem value={company.id} key={company.id} onSelect={() => { setSelectedCompany(company); setCompanyOpen(false); }}>{company.name || company.id}</CommandItem>)}</CommandList></Command></PopoverContent></Popover></> : key === "ownerMembershipId" ? <OwnerPicker id={id} name={key} value={selectedOwner} onChange={setSelectedOwner} labels={labels} required={required} disabled={!moduleEnabled || busy} /> : key === "currency" ? <FormSelect name={key} id={id} defaultValue={initial} disabled={!moduleEnabled || busy || currencyPending} options={CURRENCIES.map(item => ({ value: item.code, label: item.code }))} /> : key === "stageId" ? <FormSelect name={key} id={id} defaultValue={initial} disabled={!moduleEnabled || busy} options={DEAL_STAGE_IDS.map(stage => ({ value: stage, label: labels.stages[stage] }))} /> : ["description", "closedReason"].includes(key) ? <Textarea disabled={!moduleEnabled || busy} id={id} name={key} defaultValue={initial} /> : <Input id={id} name={key} disabled={!moduleEnabled || busy || key === "amountMinor" && currencyPending} defaultValue={key === "expectedCloseAt" ? initial.slice(0, 10) : initial} required={required} type={key === "email" ? "email" : key === "amountMinor" ? "number" : key === "expectedCloseAt" ? "date" : "text"} min={key === "amountMinor" ? 0 : undefined} step={key === "amountMinor" ? 1 : undefined} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-error` : undefined} />}
      {key === "amountMinor" && <p className="text-xs text-muted-foreground">{labels.currencyHelp}</p>}{errors[key] && <p className="text-sm text-destructive" id={`${id}-error`}>{errors[key]}</p>}</div>;
    })}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="sticky bottom-0 mt-auto flex flex-col-reverse gap-2 border-t bg-background py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{labels.cancel}</Button><Button type="submit" disabled={!moduleEnabled || busy || entity === "deal" && !record && currencyPending}>{busy ? labels.loading : labels.save}</Button></div>
  </form>;
}
