"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/config";
import { getOrderDictionary } from "@/lib/i18n/order-dictionary";
import { paymentInputSchema } from "@/lib/services/payments/payment-contract";
import { minorUnitsOf, type CurrencyCode } from "@/lib/services/currencies/currency-catalog";
import { parseFieldMoneyInput } from "../fields/field-money-input";
import { crmRequest } from "../record-types";
import { OrderOperationForm } from "./order-operation-form";
export function PaymentForm({ orderId, revision, currency, kind, locale, disabled, refresh, onSaved, onCancel }: { orderId: string; revision: number; currency: CurrencyCode; kind: "collection" | "refund"; locale: AppLocale; disabled?: boolean; refresh: () => Promise<number>; onSaved: () => void; onCancel: () => void }) {
  const labels = getOrderDictionary(locale); const [amount, setAmount] = useState(""); const [method, setMethod] = useState(""); const [reference, setReference] = useState("");
  return <OrderOperationForm title={kind === "collection" ? labels.collect : labels.refund} help={labels.cashHelp} revision={revision} locale={locale} disabled={disabled} refresh={refresh} onSaved={onSaved} onCancel={onCancel} prepare={metadata => { const parsed = parseFieldMoneyInput(amount, currency); if (!parsed.valid || parsed.amountMinor === null) throw new Error("400"); return paymentInputSchema.parse({ ...metadata, kind, amountMinor: parsed.amountMinor, method, reference }); }} submit={payload => crmRequest(`/api/crm/orders/${orderId}/payments`, { method: "POST", body: JSON.stringify(payload) })}>
    <label className="block space-y-1 text-sm">{labels.amount} ({currency})<Input type="number" required min={minorUnitsOf(currency) === 0 ? 1 : 0.01} step={minorUnitsOf(currency) === 0 ? 1 : 0.01} value={amount} onChange={event => setAmount(event.target.value)} /></label><label className="block space-y-1 text-sm">{labels.method}<Input required maxLength={100} value={method} onChange={event => setMethod(event.target.value)} /></label><label className="block space-y-1 text-sm">{labels.reference}<Input maxLength={200} value={reference} onChange={event => setReference(event.target.value)} /></label>
  </OrderOperationForm>;
}
