"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { FieldDefinition } from "@/lib/services/custom-fields/field-contracts";
import { fieldCriteriaSchema, fieldFilterOperators, isValidFieldCriterion, type FieldCriterion } from "@/lib/services/custom-fields/field-filter-contracts";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { FormSelect } from "../record-sheet/form-select";
import { OwnerPicker } from "../owner-picker";
import { CustomerFieldPicker } from "./customer-field-picker";
import { FieldDateTimeEditor } from "./field-datetime-editor";
import { MoneyEditor } from "./field-editor";

type Draft = { id: number; criterion: FieldCriterion };
export function FieldConditionsDialog({ fields, initial, labels, onApply, onClose }: { fields: FieldDefinition[]; initial: FieldCriterion[]; labels: CrmDictionary; onApply: (criteria: FieldCriterion[]) => void; onClose: () => void }) {
  const available = fields.filter(field => !field.archivedAt && field.showOnFilter);
  const [drafts, setDrafts] = useState<Draft[]>(initial.map((criterion, id) => ({ id, criterion: { ...criterion } })));
  const nextId = useRef(initial.length);
  const [error, setError] = useState(false);
  function update(id: number, criterion: FieldCriterion) { setError(false); setDrafts(previous => previous.map(draft => draft.id === id ? { id, criterion } : draft)); }
  function apply() {
    const parsed = fieldCriteriaSchema.safeParse(drafts.map(draft => draft.criterion));
    if (!parsed.success || parsed.data.some(criterion => { const field = available.find(item => item.key === criterion.key); return !field || !isValidFieldCriterion(field.type, criterion); })) { setError(true); return; }
    onApply(parsed.data);
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent closeLabel={labels.close} className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"><DialogTitle>{labels.custom.conditions}</DialogTitle><DialogDescription>{labels.custom.conditionsHelp}</DialogDescription>
    <form onSubmit={event => { event.preventDefault(); apply(); }} className="space-y-4">
      {drafts.map((draft, index) => {
        const criterion = draft.criterion;
        const field = available.find(item => item.key === criterion.key);
        return <fieldset key={draft.id} className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-xs font-medium">{labels.custom.condition} {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs">{labels.custom.conditionField}<FormSelect id={`condition-field-${draft.id}`} value={criterion.key} onValueChange={key => { const target = available.find(item => item.key === key)!; update(draft.id, { key, operator: fieldFilterOperators(target.type)[0]! }); }} options={available.map(item => ({ value: item.key, label: item.label }))} /></label>
          <label className="block space-y-1 text-xs">{labels.custom.conditionOperator}<FormSelect id={`condition-operator-${draft.id}`} value={criterion.operator} onValueChange={operator => { const next = operator as FieldCriterion["operator"]; update(draft.id, { key: criterion.key, operator: next, ...(!["empty", "not_empty"].includes(next) && criterion.value !== undefined ? { value: criterion.value } : {}) }); }} options={(field ? fieldFilterOperators(field.type) : []).map(operator => ({ value: operator, label: labels.custom.operators[operator] }))} /></label>
        </div>{field && !["empty", "not_empty"].includes(criterion.operator) && <div key={`${field.key}-${criterion.operator}`} className="space-y-1"><label htmlFor={`condition-value-${draft.id}`} className="block text-xs">{labels.custom.conditionValue}</label><ConditionValue id={`condition-value-${draft.id}`} field={field} criterion={criterion} labels={labels} onChange={value => update(draft.id, { key: criterion.key, operator: criterion.operator, ...(value === undefined ? {} : { value }) })} /></div>}
          {!field && <p role="alert" className="text-xs text-destructive">{labels.missing}</p>}<Button type="button" size="sm" variant="ghost" onClick={() => { setDrafts(previous => previous.filter(item => item.id !== draft.id)); setError(false); }}>{labels.custom.removeCondition}</Button>
        </fieldset>;
      })}
      {!drafts.length && <p className="text-xs text-muted-foreground">{labels.custom.noConditions}</p>}
      <Button type="button" variant="outline" disabled={drafts.length >= 20 || !available.length} onClick={() => { const field = available[0]!; setDrafts(previous => [...previous, { id: nextId.current++, criterion: { key: field.key, operator: fieldFilterOperators(field.type)[0]! } }]); }}>{labels.custom.addCondition}</Button>
      {error && <p role="alert" className="text-xs text-destructive">{labels.invalid}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onApply([])}>{labels.custom.clearConditions}</Button><Button type="button" variant="outline" onClick={onClose}>{labels.cancel}</Button><Button type="submit">{labels.apply}</Button></div>
    </form>
  </DialogContent></Dialog>;
}

function ConditionValue({ id, field, criterion, labels, onChange }: { id: string; field: FieldDefinition; criterion: FieldCriterion; labels: CrmDictionary; onChange: (value: FieldCriterion["value"]) => void }) {
  const value = criterion.value;
  if (field.type === "date") return <DateConditionValue id={id} value={typeof value === "string" ? value : undefined} timeZone={field.calendar?.timeZone ?? "UTC"} labels={labels} onChange={onChange} />;
  if (field.type === "money") return <MoneyEditor id={id} required value={value && typeof value === "object" ? value : null} onChange={next => onChange(next && typeof next === "object" && !Array.isArray(next) ? next : undefined)} labels={labels} />;
  if (field.type === "customer") return <CustomerFieldPicker id={id} value={typeof value === "string" ? value : null} onChange={next => onChange(next ?? undefined)} labels={labels} required allowArchived />;
  if (field.type === "user") return <OwnerPicker id={id} value={typeof value === "string" ? { membershipId: value, name: null, email: null } : null} onChange={next => onChange(next?.membershipId)} labels={labels} required />;
  if (field.type === "select" || field.type === "multiselect") return <FormSelect id={id} required value={typeof value === "string" ? value : ""} onValueChange={onChange} options={field.options.map(option => ({ value: option.id, label: `${option.label}${option.archivedAt ? ` · ${labels.archived}` : ""}` }))} />;
  if (field.type === "checkbox") return <FormSelect id={id} required value={typeof value === "boolean" ? String(value) : ""} onValueChange={next => onChange(next === "true")} options={[{ value: "true", label: labels.custom.yes }, { value: "false", label: labels.custom.no }]} />;
  const numeric = ["number", "rating", "formula"].includes(field.type);
  return <div className="space-y-1"><Input id={id} required type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} maxLength={255} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => onChange(event.currentTarget.value === "" ? undefined : numeric ? Number(event.currentTarget.value) : event.currentTarget.value)} /></div>;
}

function DateConditionValue({ id, value, timeZone, labels, onChange }: { id: string; value?: string; timeZone: string; labels: CrmDictionary; onChange: (value: string | undefined) => void }) {
  const [mode, setMode] = useState(value?.includes("T") ? "instant" : "day");
  return <div className="space-y-2"><label className="block space-y-1 text-xs">{labels.custom.dateComparison}<FormSelect id={`${id}-mode`} value={mode} onValueChange={next => { setMode(next); onChange(undefined); }} options={[{ value: "day", label: labels.custom.calendarDay }, { value: "instant", label: labels.custom.exactInstant }]} /></label>{mode === "instant" ? <FieldDateTimeEditor key={`instant-${timeZone}`} id={id} value={value ?? null} timeZone={timeZone} labels={labels} required onChange={next => onChange(next ?? undefined)} /> : <div className="space-y-1"><Input id={id} type="date" required value={value ?? ""} onChange={event => onChange(event.currentTarget.value || undefined)} /><p className="text-xs text-muted-foreground">{labels.custom.conditionDateHelp}</p></div>}</div>;
}
