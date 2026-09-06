"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/config";
import { getOrderDictionary } from "@/lib/i18n/order-dictionary";
import { orderCommandInputSchema } from "@/lib/services/orders/order-command-contract";
import { minorUnitsOf, type CurrencyCode } from "@/lib/services/currencies/currency-catalog";
import { parseFieldMoneyInput } from "../fields/field-money-input";
import { crmRequest } from "../record-types";
import { OrderOperationForm } from "./order-operation-form";
export function OrderCommandForm({ orderId, revision, currency, action, locale, disabled, refresh, onSaved, onCancel }: { orderId: string; revision: number; currency: CurrencyCode; action: "confirm" | "complete" | "cancel" | "adjust"; locale: AppLocale; disabled?: boolean; refresh: () => Promise<number>; onSaved: () => void; onCancel: () => void }) {
  const labels = getOrderDictionary(locale); const [amounts, setAmounts] = useState({ goodsMinor: "0", surchargeMinor: "0", taxMinor: "0" });
  return <OrderOperationForm title={labels[action === "cancel" ? "cancelOrder" : action]} help={action === "adjust" ? undefined : labels[`${action}Help`]} revision={revision} locale={locale} disabled={disabled} requireReason={action === "cancel" || action === "adjust"} refresh={refresh} onSaved={onSaved} onCancel={onCancel} prepare={metadata => orderCommandInputSchema.parse({ ...metadata, action, ...(action === "adjust" ? Object.fromEntries(Object.entries(amounts).map(([key, value]) => { const parsed = parseFieldMoneyInput(value, currency); if (!parsed.valid || parsed.amountMinor === null) throw new Error("400"); return [key, parsed.amountMinor]; })) : {}) })} submit={payload => crmRequest(`/api/crm/orders/${orderId}/commands`, { method: "POST", body: JSON.stringify(payload) })}>
    {action === "adjust" && Object.entries(amounts).map(([key, value]) => <label key={key} className="block space-y-1 text-sm">{labels[key === "goodsMinor" ? "goodsReduction" : key === "surchargeMinor" ? "surchargeReduction" : "taxReduction"]} ({currency})<Input type="number" required min={0} step={minorUnitsOf(currency) === 0 ? 1 : 0.01} value={value} onChange={event => setAmounts(current => ({ ...current, [key]: event.target.value }))} /></label>)}
  </OrderOperationForm>;
}
