"use client";
import { useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/config";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getOrderDictionary } from "@/lib/i18n/order-dictionary";
import { orderCreateInputSchema, type OrderLine, type orderPreviewOutputSchema } from "@/lib/services/orders/order-contract";
import { CURRENCIES, formatMinor, minorUnitsOf, type CurrencyCode } from "@/lib/services/currencies/currency-catalog";
import { EntityForm } from "../entity-form";
import { FormSelect } from "../record-sheet/form-select";
import { parseFieldMoneyInput, formatFieldMoneyInput } from "../fields/field-money-input";
import { crmRequest, recordName, requestError, type CrmRecord } from "../record-types";
import { OrderContactPicker } from "./order-contact-picker";
import { OrderLineEditor, type OrderLineDraft } from "./order-line-editor";
import type { LayoutSettings } from "@/lib/services/layouts/layout-contracts";
type Preview = z.infer<typeof orderPreviewOutputSchema>;
function initialLines(record?: CrmRecord): OrderLineDraft[] { return ((record?.lines ?? []) as OrderLine[]).map(row => ({ variantId: row.variantId, productId: row.productId, productRevision: row.expectedProductRevision, variantRevision: row.expectedVariantRevision, productName: row.name, variantLabel: row.label, sku: row.sku, catalogPriceMinor: -1, quantity: String(row.quantity), unitPriceInput: formatFieldMoneyInput(row.unitPriceMinor, row.currency), discountInput: formatFieldMoneyInput(row.discountMinor, row.currency), currency: row.currency })); }
export function OrderForm({ record: initialRecord, fixedContact, submitCreate, locale, labels: crm, readOnly, onSaved, onCancel, initialLayout }: { record?: CrmRecord; fixedContact?: CrmRecord; submitCreate?: (data: Record<string, unknown>) => Promise<{ id: string }>; locale: AppLocale; labels: CrmDictionary; readOnly?: boolean; onSaved: (id: string) => void; onCancel: () => void; initialLayout?: LayoutSettings }) {
  const labels = getOrderDictionary(locale); const [record, setRecord] = useState(initialRecord); const [formKey, setFormKey] = useState(0); const [currency, setCurrency] = useState<CurrencyCode>((record?.currency as CurrencyCode) ?? "USD"); const [contact, setContact] = useState<CrmRecord | null>(fixedContact ?? (record?.contactId ? { id: String(record.contactId), name: String(record.contactName) } : null)); const [lines, setLines] = useState(() => initialLines(record));
  const [charges, setCharges] = useState(() => Object.fromEntries(["discountMinor", "surchargeMinor", "taxMinor"].map(key => [key, formatFieldMoneyInput(Number(record?.[key] ?? 0), currency)])) as Record<string, string>); const [preview, setPreview] = useState<Preview>(); const [previewKey, setPreviewKey] = useState(""); const [error, setError] = useState(""); const [conflict, setConflict] = useState(false); const [busy, setBusy] = useState(false);
  const disabled = Boolean(readOnly || record && record.state !== "draft");
  function money(value: string) { const parsed = parseFieldMoneyInput(value, currency); if (!parsed.valid || parsed.amountMinor === null) throw new Error("400"); return parsed.amountMinor; }
  function prepare(data: Record<string, unknown>) {
    if (!contact || !lines.length || lines.length > 50 || lines.some(row => row.currency !== currency)) throw new Error("400");
    return { ...data, ...(Object.hasOwn(data, "contactId") || !record ? { contactId: contact.id } : {}), currency, lines: lines.map(row => { const unitPriceMinor = money(row.unitPriceInput); return { variantId: row.variantId, expectedVariantRevision: row.variantRevision, expectedProductRevision: row.productRevision, quantity: Number(row.quantity), ...(unitPriceMinor !== row.catalogPriceMinor ? { unitPriceMinor } : {}), discountMinor: money(row.discountInput) }; }), ...Object.fromEntries(Object.entries(charges).map(([key, value]) => [key, money(value)])) };
  }
  async function beforeSubmit(input: Record<string, unknown>) {
    const data = input.action === "update" ? input.data as Record<string, unknown> : input; const { expectedRevision: _revision, draftId: _draftId, ...create } = data;
    const proposed = orderCreateInputSchema.parse({ ...(record ? { name: record.name, contactId: record.contactId, currency: record.currency } : {}), ...create }); const key = JSON.stringify(proposed);
    if (preview && previewKey === key) return true;
    const next = await crmRequest<Preview>("/api/crm/orders/preview", { method: "POST", body: JSON.stringify(proposed) }); setPreview(next); setPreviewKey(key); return false;
  }
  async function reload() { if (!record) return; setBusy(true); setError(""); try { const next = await crmRequest<CrmRecord>(`/api/crm/orders/${record.id}`); const nextCurrency = next.currency as CurrencyCode; setRecord(next); setCurrency(nextCurrency); setContact({ id: String(next.contactId), name: String(next.contactName) }); setLines(initialLines(next)); setCharges(Object.fromEntries(["discountMinor", "surchargeMinor", "taxMinor"].map(key => [key, formatFieldMoneyInput(Number(next[key]), nextCurrency)]))); setPreview(undefined); setConflict(false); setFormKey(value => value + 1); } catch (failure) { setError(requestError(failure, crm)); } finally { setBusy(false); } }
  return <div className="space-y-4"><EntityForm key={formKey} entity="order" initialLayout={initialLayout} record={record} labels={crm} onSaved={onSaved} onCancel={onCancel} readOnly={disabled || conflict || busy} prepareInput={prepare} beforeSubmit={beforeSubmit} submitCreate={submitCreate} submitLabel={preview ? crm.save : labels.preview} onConflict={() => { if (record) setConflict(true); }}
    renderBuiltin={({ key, id, disabled }) => key === "contactId" ? fixedContact ? <p id={id} className="rounded-md border px-3 py-2 text-sm">{recordName(fixedContact)}</p> : <OrderContactPicker id={id} value={contact} labels={labels} disabled={disabled} onChange={value => { setContact(value); setPreview(undefined); }} /> : key === "currency" ? <FormSelect id={id} value={currency} disabled={disabled} onValueChange={value => { setCurrency(value as CurrencyCode); setPreview(undefined); }} options={CURRENCIES.map(row => ({ value: row.code, label: row.code }))} /> : undefined}
    extraFields={<div className="space-y-4"><OrderLineEditor value={lines} onChange={value => { setLines(value); setPreview(undefined); }} labels={labels} currency={currency} disabled={disabled} /><div className="grid gap-3 sm:grid-cols-3">{Object.entries(charges).map(([key, value]) => <label key={key} className="block space-y-1 text-sm">{labels[key === "discountMinor" ? "orderDiscount" : key === "surchargeMinor" ? "surcharge" : "tax"]}<Input type="number" required min={0} step={minorUnitsOf(currency) === 0 ? 1 : 0.01} value={value} onChange={event => { setCharges(current => ({ ...current, [key]: event.target.value })); setPreview(undefined); }} /></label>)}</div><p className="text-sm text-muted-foreground">{labels.previewHelp}</p>{preview && <div className="space-y-3 rounded-md border p-4" role="status"><h3 className="font-medium">{labels.preview}</h3><ul className="space-y-2 text-sm">{preview.lines.map((line, index) => <li key={index} className="flex flex-wrap justify-between gap-2"><span className="break-words">{line.name} · {line.label} × {line.quantity}</span><span>{formatMinor(line.totalMinor, preview.currency, locale)}</span></li>)}</ul><p className="font-medium">{labels.originalPayable}: {formatMinor(preview.originalMinor, preview.currency, locale)}</p></div>}</div>} />
    {conflict && <div className="space-y-3 rounded-md border p-4"><p>{labels.conflict} {labels.discardDraft}</p>{error && <p role="alert">{error}</p>}<Button variant="outline" disabled={busy} onClick={() => void reload()}>{labels.reload}</Button></div>}
  </div>;
}
