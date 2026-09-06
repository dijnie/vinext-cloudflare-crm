"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDefinition, FieldValue } from "@/lib/services/custom-fields/field-contracts";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { OwnerPicker } from "../owner-picker";
import { FormSelect } from "../record-sheet/form-select";

export function FieldEditor({ field, value, onChange, labels, disabled }: { field: FieldDefinition; value: FieldValue; onChange: (value: FieldValue) => void; labels: CrmDictionary; disabled?: boolean }) {
  const id = `custom-${field.id}`;
  const common = { id, disabled, required: field.required, className: "w-full" };
  const text = value == null ? "" : String(value);
  const unavailable = field.type === "select" && value != null && !field.options.some(option => option.id === value && !option.archivedAt);
  return <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2"><label htmlFor={id} className="truncate pt-2 text-xs text-muted-foreground">{field.label}{field.required ? " *" : ""}</label>
    {field.type === "user" ? <OwnerPicker id={id} name={field.key} value={text ? { membershipId: text, name: null, email: null } : null} onChange={owner => onChange(owner?.membershipId ?? null)} labels={labels} disabled={disabled} required={field.required} />
      : field.type === "select" ? <FormSelect id={id} required={field.required} disabled={disabled} value={text} onValueChange={next => onChange(next || null)} options={[{ value: "", label: labels.none, disabled: field.required }, ...(unavailable ? [{ value: text, label: `${field.options.find(option => option.id === text)?.label ?? text} · ${labels.archived}`, disabled: true }] : []), ...field.options.filter(option => !option.archivedAt).map(option => ({ value: option.id, label: option.label }))]} />
      : field.type === "checkbox" ? <FormSelect id={id} required={field.required} disabled={disabled} value={value == null ? "" : String(value)} onValueChange={next => onChange(next === "" ? null : next === "true")} options={[{ value: "", label: labels.none, disabled: field.required }, { value: "true", label: labels.custom.yes }, { value: "false", label: labels.custom.no }]} />
      : field.type === "long_text" ? <Textarea {...common} maxLength={50000} rows={4} value={text} onChange={event => onChange(event.target.value || null)} />
      : <Input {...common} type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text"} step={field.type === "number" ? "any" : undefined} maxLength={field.type === "text" ? 50000 : undefined} value={field.type === "date" ? text.slice(0, 10) : text} onChange={event => onChange(event.target.value === "" ? null : field.type === "number" ? Number(event.target.value) : event.target.value)} />}
  </div>;
}
