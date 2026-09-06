"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/services/currencies/currency-catalog";
import { formatFieldMoneyInput, parseFieldMoneyInput } from "./field-money-input";
import { FileFieldEditor, type FileFieldContext } from "./file-field-editor";
import { FieldDateTimeEditor } from "./field-datetime-editor";
import { CustomerFieldPicker } from "./customer-field-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDefinition, FieldValue } from "@/lib/services/custom-fields/field-contracts";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { OwnerPicker } from "../owner-picker";
import { FormSelect } from "../record-sheet/form-select";

export function FieldEditor({ field, value, onChange, labels, disabled, fileContext }: { field: FieldDefinition; value: FieldValue; onChange: (value: FieldValue) => void; labels: CrmDictionary; disabled?: boolean; fileContext?: FileFieldContext }) {
  const id = `custom-${field.id}`;
  const common = { id, disabled, required: field.required, className: "w-full" };
  const text = value == null ? "" : String(value);
  const unavailable = field.type === "select" && value != null && !field.options.some(option => option.id === value && !option.archivedAt);
  return <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2"><label htmlFor={id} className="truncate pt-2 text-xs text-muted-foreground">{field.label}{field.required ? " *" : ""}</label>
    {field.type === "file" ? <FileFieldEditor id={id} field={field} value={value} onChange={onChange} labels={labels} disabled={disabled} context={fileContext} />
      : field.type === "date" && field.config?.dateTime ? field.calendar ? <FieldDateTimeEditor key={`${id}-${field.calendar.timeZone}`} id={id} value={typeof value === "string" ? value : null} timeZone={field.calendar.timeZone} labels={labels} required={field.required} disabled={disabled} onChange={onChange} /> : <p role="alert" className="text-xs text-destructive">{labels.custom.calendarStale}</p>
      : field.type === "formula" ? <div className="space-y-1"><output id={id} aria-label={field.label} aria-describedby={`${id}-formula-help`} className="block py-2 text-xs tabular-nums">{typeof value === "number" ? String(value) : "—"}</output><p id={`${id}-formula-help`} className="text-xs text-muted-foreground">{labels.custom.formulaReadOnly}</p></div>
      : field.type === "money" ? <MoneyEditor id={id} value={value} onChange={onChange} labels={labels} required={field.required} disabled={disabled} />
      : field.type === "customer" ? <CustomerFieldPicker id={id} value={typeof value === "string" ? value : null} onChange={onChange} labels={labels} required={field.required} disabled={disabled} />
      : field.type === "multiselect" ? <fieldset id={id} aria-label={field.label} disabled={disabled} className="space-y-2 py-1">{field.options.filter(option => !option.archivedAt || Array.isArray(value) && value.includes(option.id)).map(option => <label key={option.id} className="flex items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={Array.isArray(value) && value.includes(option.id)} onChange={event => { const selected = Array.isArray(value) ? value : []; onChange(event.currentTarget.checked ? [...selected, option.id] : selected.filter(id => id !== option.id)); }} />{option.label}{option.archivedAt ? ` · ${labels.archived}` : ""}</label>)}</fieldset>
      : field.type === "multivalue" ? <div id={id} className="space-y-2">{(Array.isArray(value) ? value : []).map((item, index) => <div key={index} className="flex gap-1"><Input aria-label={`${field.label} ${index + 1}`} required maxLength={2000} value={item} disabled={disabled} onChange={event => onChange((Array.isArray(value) ? value : []).map((previous, at) => index === at ? event.currentTarget.value : previous))} /><Button type="button" variant="ghost" aria-label={`${labels.custom.removeValue} ${index + 1}`} disabled={disabled} onClick={() => onChange((Array.isArray(value) ? value : []).filter((_, at) => at !== index))}>×</Button></div>)}<Button type="button" variant="outline" size="sm" disabled={disabled || Array.isArray(value) && value.length >= 100} onClick={() => onChange([...(Array.isArray(value) ? value : []), ""])}>{labels.custom.addValue}</Button></div>
      : field.type === "rating" ? <div className="space-y-1"><Input {...common} type="number" min={0} max={field.config?.ratingMax ?? 5} step={1} value={typeof value === "number" ? value : ""} onChange={event => onChange(event.currentTarget.value === "" ? null : Number(event.currentTarget.value))} /><p className="text-xs text-muted-foreground">{labels.custom.ratingRange}: 0–{field.config?.ratingMax ?? 5}</p></div>
      : field.type === "user" ? <OwnerPicker id={id} name={field.key} value={text ? { membershipId: text, name: null, email: null } : null} onChange={owner => onChange(owner?.membershipId ?? null)} labels={labels} disabled={disabled} required={field.required} />
      : field.type === "select" ? <FormSelect id={id} required={field.required} disabled={disabled} value={text} onValueChange={next => onChange(next || null)} options={[{ value: "", label: labels.none, disabled: field.required }, ...(unavailable ? [{ value: text, label: `${field.options.find(option => option.id === text)?.label ?? text} · ${labels.archived}`, disabled: true }] : []), ...field.options.filter(option => !option.archivedAt).map(option => ({ value: option.id, label: option.label }))]} />
      : field.type === "checkbox" ? <FormSelect id={id} required={field.required} disabled={disabled} value={value == null ? "" : String(value)} onValueChange={next => onChange(next === "" ? null : next === "true")} options={[{ value: "", label: labels.none, disabled: field.required }, { value: "true", label: labels.custom.yes }, { value: "false", label: labels.custom.no }]} />
      : field.type === "long_text" ? <Textarea {...common} maxLength={50000} rows={4} value={text} onChange={event => onChange(event.target.value || null)} />
      : <Input {...common} type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text"} step={field.type === "number" ? "any" : undefined} maxLength={field.type === "text" ? 50000 : undefined} value={field.type === "date" ? text.slice(0, 10) : text} onChange={event => onChange(event.target.value === "" ? null : field.type === "number" ? Number(event.target.value) : event.target.value)} />}
  </div>;
}

export function MoneyEditor({ id, value, onChange, labels, disabled, required }: { id: string; value: FieldValue; onChange: (value: FieldValue) => void; labels: CrmDictionary; disabled?: boolean; required?: boolean }) {
  const money = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const [currency, setCurrency] = useState<CurrencyCode>(money?.currency ?? "USD");
  const [draft, setDraft] = useState(money ? formatFieldMoneyInput(money.amountMinor, money.currency) : "");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  function update(text: string, selectedCurrency: CurrencyCode) {
    const parsed = parseFieldMoneyInput(text, selectedCurrency);
    setInvalid(!parsed.valid);
    inputRef.current?.setCustomValidity(parsed.valid ? "" : labels.custom.moneyInvalid);
    if (parsed.valid) onChange(parsed.amountMinor === null ? null : { amountMinor: parsed.amountMinor, currency: selectedCurrency });
  }
  return <div className="space-y-2"><Input ref={inputRef} id={id} type="text" inputMode="decimal" maxLength={64} required={required} disabled={disabled} value={draft} aria-invalid={invalid || undefined} aria-describedby={`${id}-money-help${invalid ? ` ${id}-money-error` : ""}`} onChange={event => { const next = event.currentTarget.value; setDraft(next); update(next, currency); }} /><label className="block space-y-1 text-xs">{labels.labels.currency}<FormSelect id={`${id}-currency`} disabled={disabled} value={currency} onValueChange={next => { const selected = next as CurrencyCode; setCurrency(selected); update(draft, selected); }} options={CURRENCY_CODES.map(code => ({ value: code, label: code }))} /></label><p id={`${id}-money-help`} className="text-xs text-muted-foreground">{labels.custom.moneyHelp}</p>{invalid && <p id={`${id}-money-error`} role="alert" className="text-xs text-destructive">{labels.custom.moneyInvalid}</p>}</div>;
}
