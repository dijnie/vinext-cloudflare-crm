"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/config";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getOrderDictionary } from "@/lib/i18n/order-dictionary";
import type { orderDetailOutputSchema } from "@/lib/services/orders/order-contract";
import type { paymentListOutputSchema } from "@/lib/services/payments/payment-contract";
import type { orderOperationHistoryOutputSchema } from "@/lib/services/orders/order-command-contract";
import { formatMinor } from "@/lib/services/currencies/currency-catalog";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { crmRequest, requestError, type CrmRecord } from "../record-types";
import { useModules } from "../module-provider";
import { RecordDetails } from "../record-sheet/record-details";
import { RecordLink } from "../record-sheet/record-link";
import { PaymentForm } from "./payment-form";
import { OrderCommandForm } from "./order-command-form";
import { EntitlementPanel } from "./entitlement-panel";
type Detail = z.infer<typeof orderDetailOutputSchema>;
type Payments = z.infer<typeof paymentListOutputSchema>;
type History = z.infer<typeof orderOperationHistoryOutputSchema>;
export function OrderSheet({ record, locale, labels: crm, readOnly }: { record: CrmRecord; locale: AppLocale; labels: CrmDictionary; readOnly?: boolean }) {
  const labels = getOrderDictionary(locale), modules = useModules(); const [current, setCurrent] = useState(record as unknown as Detail); const [payments, setPayments] = useState<Payments>({ rows: [] }); const [history, setHistory] = useState<History>({ rows: [] }); const [action, setAction] = useState<"confirm" | "complete" | "cancel" | "adjust" | "collection" | "refund">(); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  async function refresh() {
    const requestGeneration = ++generation.current;
    const next = await crmRequest<Detail>(`/api/crm/orders/${record.id}`);
    const [cash, events] = await Promise.all([crmRequest<Payments>(`/api/crm/orders/${record.id}/payments`), crmRequest<History>(`/api/crm/orders/${record.id}/commands`)]);
    const latest = await crmRequest<Detail>(`/api/crm/orders/${record.id}`); if (next.revision !== latest.revision) throw new Error("409");
    if (requestGeneration !== generation.current) throw new Error("409");
    setCurrent(next); setPayments(cash); setHistory(events); setError(""); setLoading(false); return next.revision;
  }
  useEffect(() => { let active = true; void refresh().catch(reason => { if (active) { setError(requestError(reason, crm)); setLoading(false); } }); return () => { active = false; generation.current++; }; }, [record.id, record.revision]);
  const disabled = Boolean(readOnly || !modules.isEnabled("order") || current.archivedAt || error || loading);
  const obligation = BigInt(current.goodsRemainingMinor) + BigInt(current.surchargeRemainingMinor) + BigInt(current.taxRemainingMinor), net = BigInt(current.collectedMinor) - BigInt(current.refundedMinor), balance = BigInt(current.balanceMinor);
  const money = (value: bigint | number | string) => formatMinor(value, current.currency, locale);
  function done() {
    setAction(undefined);
    setLoading(true);
    void refresh().then(() => invalidateCrm("order")).catch(reason => {
      setError(requestError(reason, crm));
      setLoading(false);
    });
  }
  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]"><section className="space-y-4 border-b p-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{labels.fulfillment}: {labels[current.state]}</h3><span className="text-sm">{labels.number}: {current.number}</span></div><RecordLink entity="contact" id={current.contactId}>{current.contactName}</RecordLink><dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-sm">{([[labels.originalPayable, current.originalMinor], [labels.obligation, obligation], [labels.collected, current.collectedMinor], [labels.refunded, current.refundedMinor], [labels.netCollected, net], [balance < 0n ? labels.credit : labels.balance, balance < 0n ? -balance : balance]] as const).map(([label, amount]) => <div key={label} className="contents"><dt>{label}</dt><dd className="text-right tabular-nums">{money(amount)}</dd></div>)}</dl>{loading && <p role="status">{labels.loading}</p>}{error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void refresh().catch(reason => setError(requestError(reason, crm)))}>{crm.retry}</Button></div>}
    <div className="flex flex-wrap gap-2">{current.state === "draft" && <Button disabled={disabled || Boolean(action)} onClick={() => setAction("confirm")}>{labels.confirm}</Button>}{current.state === "confirmed" && <Button disabled={disabled || Boolean(action)} onClick={() => setAction("complete")}>{labels.complete}</Button>}{current.state !== "cancelled" && <Button variant="outline" disabled={disabled || Boolean(action)} onClick={() => setAction("cancel")}>{labels.cancelOrder}</Button>}{current.state !== "draft" && <>{current.state !== "cancelled" && <Button variant="outline" disabled={disabled || Boolean(action)} onClick={() => setAction("collection")}>{labels.collect}</Button>}<Button variant="outline" disabled={disabled || Boolean(action) || net <= 0n} onClick={() => setAction("refund")}>{labels.refund}</Button>{current.state !== "cancelled" && <Button variant="outline" disabled={disabled || Boolean(action) || obligation <= 0n} onClick={() => setAction("adjust")}>{labels.adjust}</Button>}</>}</div>
    {action && (action === "collection" || action === "refund" ? <PaymentForm key={action} orderId={current.id} revision={current.revision} currency={current.currency} kind={action} locale={locale} disabled={disabled} refresh={refresh} onSaved={done} onCancel={() => setAction(undefined)} /> : <OrderCommandForm key={action} orderId={current.id} revision={current.revision} currency={current.currency} action={action} locale={locale} disabled={disabled} refresh={refresh} onSaved={done} onCancel={() => setAction(undefined)} />)}
  </section><RecordDetails entity="order" record={current} locale={locale} labels={crm} readOnly={disabled || current.state !== "draft"} /><section className="space-y-3 border-y p-5"><h3 className="font-medium">{labels.lines}</h3><ol className="space-y-3">{current.lines.map(line => <li key={line.id} className="space-y-2 rounded-md border p-3"><div className="flex flex-wrap justify-between gap-2"><p className="break-words font-medium">{line.name} · {line.label}</p><p>{money(line.totalMinor)}</p></div><p className="text-sm">{line.quantity} × {money(line.unitPriceMinor)} · {labels.lineDiscount}: {money(line.discountMinor)}</p><RecordLink entity="product" id={line.productId}>{labels.catalog}</RecordLink>{line.components.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground">{line.components.map((component, i) => <li key={i}>{component.label} × {component.quantity}</li>)}</ul>}</li>)}</ol></section>
    <section className="space-y-3 px-5"><h3 className="font-medium">{labels.payments}</h3>{!loading && !payments.rows.length && <p className="text-sm text-muted-foreground">{labels.noHistory}</p>}<ul className="space-y-3">{payments.rows.map(row => <li key={row.id} className="space-y-1 rounded-md border p-3 text-sm"><p className="font-medium">{row.kind === "collection" ? labels.collect : labels.refund}: {formatMinor(row.amountMinor, row.currency, locale)}</p><p className="break-words">{row.businessDate} · {row.method}{row.reference ? ` · ${row.reference}` : ""}</p>{row.reason && <p className="break-words">{row.reason}</p>}{row.actorName && <p className="text-xs text-muted-foreground">{row.actorName}</p>}<time className="text-xs text-muted-foreground" dateTime={row.createdAt}>{labels.recordedAt}: {new Date(row.createdAt).toLocaleString(locale)}</time></li>)}</ul></section>
    <section className="space-y-3 px-5"><h3 className="font-medium">{labels.history}</h3><ul className="space-y-3">{history.rows.map(row => <li key={row.id} className="space-y-1 border-b pb-3 text-sm"><p>{({ confirm: labels.confirm, complete: labels.complete, cancel: labels.cancelOrder, adjust: labels.adjust, collection: labels.collect, refund: labels.refund } as Record<string, string>)[row.action] ?? row.action} · {row.businessDate}</p>{row.reason && <p className="break-words">{row.reason}</p>}<p>{labels.balance}: {money(row.result.balanceMinor)}</p>{row.adjustment && <p>{labels.goodsReduction}: {money(row.adjustment.goodsMinor)} · {labels.surchargeReduction}: {money(row.adjustment.surchargeMinor)} · {labels.taxReduction}: {money(row.adjustment.taxMinor)}</p>}{row.actorName && <p className="text-xs text-muted-foreground">{row.actorName}</p>}<time className="text-xs text-muted-foreground" dateTime={row.createdAt}>{labels.recordedAt}: {new Date(row.createdAt).toLocaleString(locale)}</time></li>)}</ul></section><EntitlementPanel orderId={current.id} locale={locale} readOnly={disabled || current.state !== "completed"} /></div>;
}
