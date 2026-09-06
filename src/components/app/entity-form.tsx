"use client";
import { useParams } from "next/navigation";
import { useLeadSettings } from "./leads/use-lead-settings";
import { LeadDuplicateSuggestions } from "./leads/lead-duplicate-suggestions";
import { CollaboratorPicker } from "./leads/collaborator-picker";
import { getLeadDictionary, leadChoiceLabel } from "@/lib/i18n/lead-dictionary";
import { productCreateInputSchema, productUpdateInputSchema } from "@/lib/services/catalog/product-contract";
import { leadCreateInputSchema, leadUpdateInputSchema } from "@/lib/services/leads/lead-contract";
import { orderCreateInputSchema, orderUpdateInputSchema } from "@/lib/services/orders/order-contract";
import { useDealStages } from "./deal-stage-provider";
import { useRecordLayout, visibleLayoutFields } from "./layouts/use-record-layout";
import { FieldEditor } from "./fields/field-editor";
import type { FieldValue } from "@/lib/services/custom-fields/field-contracts";
import { useModules } from "./module-provider";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dealCreateInputSchema, dealUpdateInputSchema } from "@/lib/services/deals/deal-contract";
import { companyCreateInputSchema, companyUpdateInputSchema } from "@/lib/services/companies/company-contract";
import { contactCreateInputSchema, contactUpdateInputSchema } from "@/lib/services/contacts/contact-contract";
import { membershipIdSchema } from "@/lib/listing/list-contract";
import { entityPaths, type EntityType } from "@/lib/listing/list-state";
import { invalidateCrm } from "@/lib/listing/invalidation";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { crmRequest, displayValue, fieldLabel, requestError, type CrmRecord, type ListData } from "./record-types";
import { FormSelect } from "./record-sheet/form-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { ChevronDown } from "@carbon/icons-react";
import { OwnerPicker, type OwnerOption } from "./owner-picker";
import { CURRENCIES } from "@/lib/services/currencies/currency-catalog";
import type { CurrencySettings } from "@/lib/services/currencies/currency-contracts";

export function EntityForm({ entity, record, labels, onSaved, onCancel, readOnly, initialValues, submitCreate, beforeSubmit, submitLabel, extraFields, prepareInput, renderBuiltin, onConflict }: { entity: EntityType; onConflict?: () => void; extraFields?: ReactNode; prepareInput?: (data: Record<string, unknown>) => Record<string, unknown>; renderBuiltin?: (args: { key: string; id: string; initial: string; required: boolean; disabled: boolean }) => ReactNode | undefined; record?: CrmRecord; readOnly?: boolean; initialValues?: Record<string, unknown>; submitCreate?: (data: Record<string, unknown>) => Promise<{ id: string }>; beforeSubmit?: (data: Record<string, unknown>) => Promise<boolean>; submitLabel?: string; labels: CrmDictionary; onSaved: (id: string) => void; onCancel: () => void }) {
  const params = useParams();
  const locale = params.locale === "vi" ? "vi" : "en";
  const leadLabels = getLeadDictionary(locale);
  const leadSettings = useLeadSettings(entity === "lead");
  const [editRevision, setEditRevision] = useState(record?.revision);
  const dirtyBuiltins = useRef(new Set<string>());
  const [leadConflict, setLeadConflict] = useState(false);
  const [latestLead, setLatestLead] = useState<CrmRecord>();
  const initialRecord = record ?? initialValues;
  const [duplicateInput, setDuplicateInput] = useState({ email: String(initialRecord?.email ?? ""), phone: String(initialRecord?.phone ?? "") });
  const [sourceId, setSourceId] = useState(String(initialRecord?.sourceId ?? "manual"));
  const [statusId, setStatusId] = useState(String(initialRecord?.statusId ?? "new"));
  const [collaborators, setCollaborators] = useState<OwnerOption[]>(() => Array.isArray(record?.collaboratorMembershipIds) ? (record.collaboratorMembershipIds as string[]).map(membershipId => ({ membershipId, name: (record?.collaboratorLabels as Record<string, string> | undefined)?.[membershipId] ?? null, email: null })) : []);
  const leadUnavailable = entity === "lead" && (!leadSettings.data || leadSettings.error);
  const invalidLeadChoice = entity === "lead" && Boolean(leadSettings.data && ((!record || dirtyBuiltins.current.has("sourceId")) && leadSettings.data.sources.some(row => row.id === sourceId && row.archivedAt && sourceId !== record?.sourceId) || (!record || dirtyBuiltins.current.has("statusId")) && leadSettings.data.statuses.some(row => row.id === statusId && row.archivedAt && statusId !== record?.statusId)));
  const stageCatalog = useDealStages();
  const { isEnabled } = useModules();
  const moduleEnabled = isEnabled(entity) && !readOnly;
  const { layout, error: layoutError, reload: reloadLayout } = useRecordLayout(entity);
  const [customValues, setCustomValues] = useState<Record<string, FieldValue>>(() => initialValues?.customFields as Record<string, FieldValue> ?? {});
  const [customChanged, setCustomChanged] = useState<Record<string, FieldValue>>(() => initialValues?.customFields as Record<string, FieldValue> ?? {});
  const [customReady, setCustomReady] = useState(!record);
  const [customError, setCustomError] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [draftId, setDraftId] = useState<string>();
  const visibleFields = layout ? visibleLayoutFields(layout, record ? "edit" : "create") : [];
  const needsDraft = !record && (entity === "order" || visibleFields.some(entry => entry.kind === "custom" && layout?.definitions.some(field => field.key === entry.key && field.type === "file")));
  useEffect(() => {
    if (!record) return;
    const controller = new AbortController();
    void crmRequest<Record<string, FieldValue>>(`/api/crm/fields/values?entity=${entity}&recordId=${encodeURIComponent(record.id)}`, { signal: controller.signal }).then(values => { if (!controller.signal.aborted) { setCustomValues(values); setCustomReady(true); } }).catch(() => { if (!controller.signal.aborted) setCustomError(true); });
    return () => controller.abort();
  }, [entity, record?.id, loadRevision]);
  useEffect(() => {
    if (!needsDraft || draftId) return;
    const controller = new AbortController();
    void crmRequest<{ id: string }>("/api/crm/record-drafts", { method: "POST", body: JSON.stringify({ entity }), signal: controller.signal }).then(draft => { if (!controller.signal.aborted) setDraftId(draft.id); }).catch(() => { if (!controller.signal.aborted) setCustomError(true); });
    return () => controller.abort();
  }, [entity, needsDraft, draftId, loadRevision]);


  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedStage, setSelectedStage] = useState(String(record?.stageId ?? stageCatalog.defaultStageId));
  const invalidStage = entity === "deal" && selectedStage !== record?.stageId && stageCatalog.all.some(stage => stage.id === selectedStage && stage.archivedAt);
  const [calendarStale, setCalendarStale] = useState(false);
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
    const fallback = membershipIdSchema.safeParse(initialRecord?.ownerMembershipId);
    return fallback.success ? { membershipId: fallback.data, name: null, email: null } : null;
  });
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companies, setCompanies] = useState<CrmRecord[]>([]); const [companySearch, setCompanySearch] = useState(""); const [optionsError, setOptionsError] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string | null } | null>(record?.company ?? (typeof initialValues?.companyId === "string" ? { id: initialValues.companyId, name: initialValues.companyId } : null));
  const companyOptions = [...new Map([
    ...companies.map(company => [company.id, { id: company.id, name: company.name ?? null }] as const),
    ...(record?.company ? [[record.company.id, record.company] as const] : []),
    ...(selectedCompany ? [[selectedCompany.id, selectedCompany] as const] : []),
  ]).values()];
  useEffect(() => { if (entity === "company") return; const controller = new AbortController(); const timer = setTimeout(() => { crmRequest<ListData>(`/api/crm/companies?pageSize=100&q=${encodeURIComponent(companySearch)}`, { signal: controller.signal }).then(data => { setCompanies(data.rows); setOptionsError(false); }).catch(() => { if (!controller.signal.aborted) setOptionsError(true); }); }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [entity, companySearch]);
  async function submit(form: HTMLFormElement) {
    if (leadUnavailable || invalidLeadChoice || invalidStage || entity === "deal" && stageCatalog.unavailable || !moduleEnabled || layoutError || customError || !layout || !customReady || needsDraft && !draftId) return;
    setError(""); setErrors({}); let data: Record<string, unknown> = {}; const formData = new FormData(form);
    for (const key of visibleFields.filter(field => field.kind === "builtin").map(field => field.key)) {
      if (record && entity === "lead" && !dirtyBuiltins.current.has(key)) continue;
      if (record && entity === "deal" && ["amountMinor", "currency"].includes(key) && currencyPending) continue;
      if (entity === "lead" && key === "collaboratorMembershipIds") { data[key] = collaborators.map(owner => owner.membershipId); continue; }
      if (entity === "lead" && key === "sourceId") { data[key] = sourceId; continue; }
      if (entity === "lead" && key === "statusId") { if (!record?.convertedAt) data[key] = statusId; continue; }
      const rawValue = key === "stageId" ? selectedStage : String(formData.get(key) ?? "").trim();
      const raw = rawValue === "__unassigned__" ? "" : rawValue;
      data[key] = key === "amountMinor" ? raw === "" ? null : Number(raw) : key === "expectedCloseAt" ? raw ? new Date(`${raw}T00:00:00Z`).toISOString() : null : raw === "" ? (record || key === "companyId" || key === "ownerMembershipId" ? null : undefined) : raw;
    }
    if (["lead", "product", "order"].includes(entity) && record) data.expectedRevision = editRevision;
    data.customFields = customChanged;
    const calendarRevision = layout.definitions.find(field => field.type === "date" && field.config?.dateTime && Object.hasOwn(customChanged, field.key))?.calendar?.revision;
    if (calendarRevision !== undefined) data.calendarRevision = calendarRevision;
    try { if (prepareInput) data = prepareInput(data); } catch { setError(labels.invalid); return; }
    const schema = record ? { company: companyUpdateInputSchema, contact: contactUpdateInputSchema, deal: dealUpdateInputSchema, lead: leadUpdateInputSchema, product: productUpdateInputSchema, order: orderUpdateInputSchema }[entity] : { company: companyCreateInputSchema, contact: contactCreateInputSchema, deal: dealCreateInputSchema, lead: leadCreateInputSchema, product: productCreateInputSchema, order: orderCreateInputSchema }[entity];
    const parsed = schema.safeParse(record ? { action: "update", data } : data);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path.at(-1)), labels.invalid]))); setError(labels.invalid); return; }
    setBusy(true);
    try { const submission = { ...parsed.data, ...(!record && draftId ? { draftId } : {}) }; if (beforeSubmit && !(await beforeSubmit(submission))) return; const saved = !record && submitCreate ? await submitCreate(submission) : await crmRequest<{ id: string }>(`/api/crm/${entityPaths[entity]}${record ? `/${record.id}` : ""}`, { method: record ? "PATCH" : "POST", body: JSON.stringify(submission) }); invalidateCrm(entity); if (record && selectedOwner?.membershipId !== record.owner?.membershipId) invalidateCrm("ownership"); onSaved(saved.id); }
    catch (reason) { if (["product", "order"].includes(entity) && reason instanceof Error && reason.message === "409") onConflict?.(); const stale = calendarRevision !== undefined && reason instanceof Error && reason.message === "409"; setLeadConflict(entity === "lead" && Boolean(record) && reason instanceof Error && reason.message === "409"); setLatestLead(undefined); setCalendarStale(stale); setError(stale ? labels.custom.calendarStale : requestError(reason, labels)); } finally { setBusy(false); }
  }
  return <form className="flex min-h-full flex-col gap-5" onChange={event => { if (entity === "lead" && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) && event.target.name && !event.target.name.startsWith("custom-")) dirtyBuiltins.current.add(event.target.name); if (entity === "lead" && event.target instanceof HTMLInputElement && ["email", "phone"].includes(event.target.name)) { const { name, value } = event.target; setDuplicateInput(previous => ({ ...previous, [name]: value })); } }} onSubmit={event => { event.preventDefault(); void submit(event.currentTarget); }}>
    {entity === "lead" && <LeadDuplicateSuggestions {...duplicateInput} id={record?.id} locale={locale} />}
    {leadUnavailable && <p role={leadSettings.error ? "alert" : "status"}>{leadSettings.error ? labels.error : labels.loading}{leadSettings.error && <Button type="button" variant="outline" onClick={leadSettings.reload}>{labels.retry}</Button>}</p>}
    {invalidLeadChoice && <p role="alert">{labels.conflict}</p>}
    {entity === "deal" && currencyPending && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{labels.currencyPending}</p>}
    {invalidStage && <p role="alert">{stageCatalog.labels.archivedChoice}</p>}
    {entity === "deal" && stageCatalog.unavailable && <p role="alert">{stageCatalog.labels.unavailable}<Button type="button" variant="outline" onClick={stageCatalog.refresh}>{labels.retry}</Button></p>}
    {optionsError && <p role="alert" className="text-sm text-destructive">{labels.error}</p>}
    {(layoutError || customError) && <p role="alert">{labels.error}<Button type="button" variant="outline" onClick={() => { if (customError) { setCustomError(false); setLoadRevision(value => value + 1); } reloadLayout(); }}>{labels.retry}</Button></p>}
    {!layout || !customReady || needsDraft && !draftId ? !(layoutError || customError) && <p role="status">{labels.loading}</p> : visibleFields.map(entry => {
      if (entry.kind === "custom") {
        const field = layout.definitions.find(item => item.key === entry.key)!;
        const initial = customValues[field.key] ?? null;
        const filled = initial !== null && initial !== "" && !(Array.isArray(initial) && !initial.length);
        return <FieldEditor key={`custom:${field.id}`} field={field} enforceRequired={field.required && (!record || filled || Object.hasOwn(customChanged, field.key))} value={Object.hasOwn(customChanged, field.key) ? customChanged[field.key]! : initial} onChange={value => setCustomChanged(previous => ({ ...previous, [field.key]: value }))} labels={labels} disabled={busy || !moduleEnabled} fileContext={record ? { entity, recordId: record.id } : draftId ? { entity, recordId: draftId, draftId } : undefined} />;
      }
      const key = entry.key; const id = `record-${key}`; const required = key === "name" || key === "firstName" || entity === "product" && key === "kind" || entity === "deal" && ["companyId", "ownerMembershipId", "currency", "stageId"].includes(key) || entity === "order" && ["contactId", "currency"].includes(key); const initial = String(initialRecord?.[key] ?? (key === "currency" ? "USD" : key === "stageId" ? "demo-booked" : ""));
      const overridden = renderBuiltin?.({ key, id, initial, required, disabled: busy || !moduleEnabled });
      return <div key={key} className="space-y-2"><label className="text-xs font-medium" htmlFor={id}>{fieldLabel(key, labels)}{required ? " *" : ""}</label>
      {overridden !== undefined ? overridden : key === "gender" ? <FormSelect name={key} id={id} defaultValue={initial || "undisclosed"} disabled={!moduleEnabled || busy} options={[{ value: "female", label: locale === "vi" ? "Nữ" : "Female" }, { value: "male", label: locale === "vi" ? "Nam" : "Male" }, { value: "nonbinary", label: locale === "vi" ? "Phi nhị nguyên" : "Non-binary" }, { value: "other", label: locale === "vi" ? "Khác" : "Other" }, { value: "undisclosed", label: locale === "vi" ? "Không khai báo" : "Undisclosed" }]} /> : key === "sourceId" || key === "statusId" ? <FormSelect id={id} name={key} value={key === "sourceId" ? sourceId : statusId} onValueChange={value => { dirtyBuiltins.current.add(key); (key === "sourceId" ? setSourceId : setStatusId)(value); }} disabled={busy || !moduleEnabled || leadUnavailable || key === "statusId" && Boolean(record?.convertedAt)} options={(key === "sourceId" ? leadSettings.data?.sources ?? [] : leadSettings.data?.statuses ?? []).filter(row => row.id !== "converted" || record?.convertedAt).map(row => ({ value: row.id, label: `${leadChoiceLabel(row, locale)}${row.archivedAt ? ` · ${labels.archived}` : ""}`, disabled: Boolean(row.archivedAt) || row.id === "converted" }))} /> : key === "collaboratorMembershipIds" ? <CollaboratorPicker value={collaborators} onChange={value => { dirtyBuiltins.current.add("collaboratorMembershipIds"); setCollaborators(value); }} labels={labels} disabled={busy || !moduleEnabled} /> : key === "companyId" ? <><input type="hidden" name={key} value={selectedCompany?.id ?? ""} /><Popover open={companyOpen} onOpenChange={setCompanyOpen}><PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-expanded={companyOpen} className="w-full justify-between font-normal" disabled={!moduleEnabled || busy}>{selectedCompany?.name || labels.chooseCompany}<ChevronDown size={16} /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command shouldFilter={false}><CommandInput placeholder={labels.chooseCompany} value={companySearch} onValueChange={setCompanySearch} /><CommandList><CommandEmpty>{optionsError ? labels.error : labels.none}</CommandEmpty>{!required && <CommandItem value="none" onSelect={() => { dirtyBuiltins.current.add("companyId"); setSelectedCompany(null); setCompanyOpen(false); }}>{labels.none}</CommandItem>}{companyOptions.map(company => <CommandItem value={company.id} key={company.id} onSelect={() => { dirtyBuiltins.current.add("companyId"); setSelectedCompany(company); setCompanyOpen(false); }}>{company.name || company.id}</CommandItem>)}</CommandList></Command></PopoverContent></Popover></> : key === "ownerMembershipId" ? <OwnerPicker id={id} name={key} value={selectedOwner} onChange={value => { dirtyBuiltins.current.add("ownerMembershipId"); setSelectedOwner(value); }} labels={labels} required={required} disabled={!moduleEnabled || busy} /> : key === "currency" ? <FormSelect name={key} id={id} defaultValue={initial} disabled={!moduleEnabled || busy || currencyPending} options={CURRENCIES.map(item => ({ value: item.code, label: item.code }))} /> : key === "stageId" ? <FormSelect name={key} id={id} value={selectedStage} onValueChange={setSelectedStage} disabled={!moduleEnabled || busy || stageCatalog.unavailable} options={stageCatalog.options(selectedStage)} /> : ["description", "closedReason", "rejectionReason"].includes(key) ? <Textarea disabled={!moduleEnabled || busy} id={id} name={key} defaultValue={initial} /> : <Input id={id} name={key} disabled={!moduleEnabled || busy || key === "amountMinor" && currencyPending} defaultValue={key === "expectedCloseAt" ? initial.slice(0, 10) : initial} required={required} type={key === "email" ? "email" : key === "amountMinor" ? "number" : key === "expectedCloseAt" || key === "birthDate" ? "date" : "text"} min={key === "amountMinor" ? 0 : undefined} step={key === "amountMinor" ? 1 : undefined} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-error` : undefined} />}
      {key === "amountMinor" && <p className="text-xs text-muted-foreground">{labels.currencyHelp}</p>}{errors[key] && <p className="text-sm text-destructive" id={`${id}-error`}>{errors[key]}</p>}</div>;
    })}
    {extraFields && <fieldset disabled={busy || !moduleEnabled} className="min-w-0 space-y-4">{extraFields}</fieldset>}
    {leadConflict && record && <div className="space-y-2 rounded-md border p-3"><p className="text-sm">{leadLabels.conflictReview}</p>{latestLead ? <><dl className="space-y-1 text-sm">{[...dirtyBuiltins.current].map(key => <div key={key}><dt className="font-medium">{fieldLabel(key, labels)}</dt><dd className="break-words">{displayValue(latestLead, key === "ownerMembershipId" ? "owner" : key, locale, labels)}</dd></div>)}</dl><Button type="button" variant="outline" onClick={() => { setEditRevision(latestLead.revision); setLeadConflict(false); setLatestLead(undefined); setError(""); }}>{leadLabels.keepEdits}</Button></> : <Button type="button" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { setLatestLead(await crmRequest<CrmRecord>(`/api/crm/leads/${record.id}`)); } catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); } }}>{leadLabels.reviewCurrent}</Button>}</div>}
    {error && <div role="alert" className="text-sm text-destructive">{error}{calendarStale && <Button type="button" variant="outline" onClick={() => { reloadLayout(); setCalendarStale(false); setError(""); }}>{labels.custom.reloadFields}</Button>}</div>}<div className="sticky bottom-0 mt-auto flex flex-col-reverse gap-2 border-t bg-background py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{labels.cancel}</Button><Button type="submit" disabled={leadUnavailable || invalidLeadChoice || invalidStage || entity === "deal" && stageCatalog.unavailable || !moduleEnabled || busy || !layout || !customReady || layoutError || customError || needsDraft && !draftId || entity === "deal" && !record && currencyPending}>{busy ? labels.loading : submitLabel ?? labels.save}</Button></div>
  </form>;
}
