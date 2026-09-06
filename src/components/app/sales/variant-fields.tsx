"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogDictionary } from "@/lib/i18n/catalog-dictionary";
import { CURRENCIES, minorUnitsOf, type CurrencyCode } from "@/lib/services/currencies/currency-catalog";
import { parseFieldMoneyInput, formatFieldMoneyInput } from "../fields/field-money-input";
import { FormSelect } from "../record-sheet/form-select";
export type VariantDraft = { label: string; sku: string; priceInput: string; costInput: string; currency: string; durationMinutes: string; attributes: { key: string; value: string }[] };
export function variantDraft(value?: Record<string, unknown>): VariantDraft {
  return { label: String(value?.label ?? ""), sku: String(value?.sku ?? ""), priceInput: value?.priceMinor == null ? "" : formatFieldMoneyInput(Number(value.priceMinor), String(value.currency ?? "USD") as CurrencyCode), costInput: value?.costMinor == null ? "" : formatFieldMoneyInput(Number(value.costMinor), String(value.currency ?? "USD") as CurrencyCode), currency: String(value?.currency ?? "USD"), durationMinutes: value?.durationMinutes == null ? "" : String(value.durationMinutes), attributes: Object.entries((value?.attributes ?? {}) as Record<string, string>).map(([key, value]) => ({ key, value })) };
}
export function variantInput(draft: VariantDraft) {
  const names = draft.attributes.map(row => row.key.trim());
  if (names.some(name => !name) || new Set(names).size !== names.length) throw new Error("400");
  const price = parseFieldMoneyInput(draft.priceInput, draft.currency as CurrencyCode), cost = parseFieldMoneyInput(draft.costInput, draft.currency as CurrencyCode);
  if (!price.valid || price.amountMinor === null || !cost.valid) throw new Error("400");
  return { label: draft.label.trim(), sku: draft.sku.replace(/^ +| +$/g, "") || null, priceMinor: price.amountMinor, costMinor: cost.amountMinor, currency: draft.currency, durationMinutes: draft.durationMinutes === "" ? null : Number(draft.durationMinutes), attributes: Object.fromEntries(draft.attributes.map(row => [row.key.trim(), row.value])) };
}
export function VariantFields({ value, onChange, labels, disabled, prefix = "variant" }: { value: VariantDraft; onChange: (value: VariantDraft) => void; labels: CatalogDictionary; disabled?: boolean; prefix?: string }) {
  function set(key: keyof Omit<VariantDraft, "attributes">, next: string) { onChange({ ...value, [key]: next }); }
  return <fieldset className="space-y-3" disabled={disabled}>
    <div className="grid gap-3 sm:grid-cols-2">{(["label", "sku", "priceInput", "costInput", "durationMinutes"] as const).map(key => <label key={key} className="space-y-1 text-sm" htmlFor={`${prefix}-${key}`}>{labels[key === "priceInput" ? "price" : key === "costInput" ? "cost" : key === "durationMinutes" ? "duration" : key]}<Input id={`${prefix}-${key}`} value={value[key]} onChange={event => set(key, event.target.value)} type={["priceInput", "costInput", "durationMinutes"].includes(key) ? "number" : "text"} min={key === "durationMinutes" ? 1 : 0} max={key === "durationMinutes" ? 525_600 : undefined} step={key === "priceInput" || key === "costInput" ? minorUnitsOf(value.currency) === 0 ? 1 : 0.01 : 1} maxLength={key === "sku" ? 100 : key === "label" ? 120 : undefined} required={key === "label" || key === "priceInput"} /></label>)}<label className="space-y-1 text-sm" htmlFor={`${prefix}-currency`}>{labels.currency}<FormSelect id={`${prefix}-currency`} value={value.currency} onValueChange={next => set("currency", next)} disabled={disabled} options={CURRENCIES.map(row => ({ value: row.code, label: row.code }))} /></label></div>
    <p className="text-xs text-muted-foreground">{labels.minorHelp} {labels.costHelp} {labels.durationHelp}</p>
    <div className="space-y-2"><p className="text-sm font-medium">{labels.attributes}</p>{value.attributes.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input aria-label={`${labels.attributeName} ${index + 1}`} value={row.key} maxLength={100} required onChange={event => onChange({ ...value, attributes: value.attributes.map((entry, i) => i === index ? { ...entry, key: event.target.value } : entry) })} /><Input aria-label={`${labels.attributeValue} ${index + 1}`} value={row.value} maxLength={500} onChange={event => onChange({ ...value, attributes: value.attributes.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry) })} /><Button type="button" variant="outline" onClick={() => onChange({ ...value, attributes: value.attributes.filter((_, i) => i !== index) })}>{labels.remove}</Button></div>)}<Button type="button" variant="outline" disabled={disabled || value.attributes.length >= 30} onClick={() => onChange({ ...value, attributes: [...value.attributes, { key: "", value: "" }] })}>{labels.addAttribute}</Button></div>
  </fieldset>;
}
