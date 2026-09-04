"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDefinition, FieldValue } from "@/fields/field-contracts";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import { OwnerPicker } from "../owner-picker";
import { selectClass } from "../list-toolbar";

export function FieldEditor({ field, value, onChange, labels, disabled }: { field: FieldDefinition; value: FieldValue; onChange: (value: FieldValue) => void; labels: CrmDictionary; disabled?: boolean }) {
  const id = `custom-${field.id}`;
  const common = { id, disabled, required: field.required, className: "min-h-11 w-full" };
  const text = value == null ? "" : String(value);
  const unavailable = field.type === "select" && value != null && !field.options.some(option => option.id === value && !option.archivedAt);
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{field.label}{field.required ? " *" : ""}</label>
    {field.type === "user" ? <OwnerPicker id={id} name={field.key} value={text ? { membershipId: text, name: null, email: null } : null} onChange={owner => onChange(owner?.membershipId ?? null)} labels={labels} disabled={disabled} required={field.required} />
      : field.type === "select" ? <select {...common} className={`${selectClass} w-full`} value={text} onChange={event => onChange(event.target.value || null)}><option value="" disabled={field.required}>{labels.none}</option>{unavailable && <option value={text} disabled>{field.options.find(option => option.id === text)?.label ?? text} · {labels.archived}</option>}{field.options.filter(option => !option.archivedAt).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
      : field.type === "checkbox" ? <select {...common} className={`${selectClass} w-full`} value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="" disabled={field.required}>{labels.none}</option><option value="true">{labels.custom.yes}</option><option value="false">{labels.custom.no}</option></select>
      : field.type === "long_text" ? <Textarea {...common} maxLength={50000} rows={4} value={text} onChange={event => onChange(event.target.value || null)} />
      : <Input {...common} type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text"} step={field.type === "number" ? "any" : undefined} maxLength={field.type === "text" ? 50000 : undefined} value={field.type === "date" ? text.slice(0, 10) : text} onChange={event => onChange(event.target.value === "" ? null : field.type === "number" ? Number(event.target.value) : event.target.value)} />}
  </div>;
}
