"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderDictionary } from "@/lib/i18n/order-dictionary";
import { type CurrencyCode, minorUnitsOf } from "@/lib/services/currencies/currency-catalog";
import { formatFieldMoneyInput } from "../fields/field-money-input";
import { crmRequest } from "../record-types";
export type OrderLineDraft = { variantId: string; productId: string; productRevision: number; variantRevision: number; productName: string; variantLabel: string; sku: string | null; catalogPriceMinor: number; quantity: string; unitPriceInput: string; discountInput: string; currency: CurrencyCode };
type Choice = { id: string; productId: string; productName: string; label: string; sku: string | null; priceMinor: number; currency: CurrencyCode; revision: number };
export function OrderLineEditor({ value, onChange, currency, labels, disabled }: { value: OrderLineDraft[]; onChange: (value: OrderLineDraft[]) => void; currency: CurrencyCode; labels: OrderDictionary; disabled?: boolean }) {
  const [query, setQuery] = useState(""); const [choices, setChoices] = useState<Choice[]>([]); const [error, setError] = useState(false); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => { void crmRequest<{ rows: Choice[] }>(`/api/crm/products/variants?q=${encodeURIComponent(query)}&pageSize=30`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setChoices(data.rows); setError(false); } }).catch(() => { if (!controller.signal.aborted) setError(true); }); }, 250); return () => { controller.abort(); clearTimeout(timer); }; }, [query, revision]);
  function change(index: number, key: "quantity" | "unitPriceInput" | "discountInput", next: string) { onChange(value.map((row, i) => i === index ? { ...row, [key]: next } : row)); }
  async function add(choice: Choice) { if (value.length >= 50) return; setBusy(true); setError(false); try { const product = await crmRequest<{ revision: number }>(`/api/crm/products/${choice.productId}`); onChange([...value, { variantId: choice.id, productId: choice.productId, productRevision: product.revision, variantRevision: choice.revision, productName: choice.productName, variantLabel: choice.label, sku: choice.sku, catalogPriceMinor: choice.priceMinor, quantity: "1", unitPriceInput: formatFieldMoneyInput(choice.priceMinor, choice.currency), discountInput: "0", currency: choice.currency }]); } catch { setError(true); } finally { setBusy(false); } }
  async function refreshLine(index: number) {
    setBusy(true); setError(false);
    try {
      const row = value[index];
      const product = await crmRequest<{ revision: number; name: string; archivedAt: string | null; variants: (Choice & { archivedAt: string | null })[] }>(`/api/crm/products/${row.productId}`);
      const variant = product.variants.find(item => item.id === row.variantId && !item.archivedAt);
      if (!variant || product.archivedAt || variant.currency !== currency) throw new Error("409");
      onChange(value.map((item, i) => i === index ? { ...item, productRevision: product.revision, variantRevision: variant.revision, productName: product.name, variantLabel: variant.label, sku: variant.sku, currency: variant.currency, catalogPriceMinor: variant.priceMinor } : item));
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <fieldset className="min-w-0 space-y-3 [overflow-wrap:anywhere]" disabled={disabled || busy}><legend className="font-medium">{labels.lines}</legend><p className="text-xs text-muted-foreground">{labels.currencyHelp}</p><ol className="space-y-3">{value.map((row, index) => <li key={`${row.variantId}-${index}`} className="space-y-3 rounded-md border p-3"><p className="break-words text-sm font-medium">{row.productName} · {row.variantLabel}</p>{row.sku && <p className="break-words text-xs text-muted-foreground">{row.sku}</p>}<div className="grid gap-3 sm:grid-cols-3">{(["quantity", "unitPriceInput", "discountInput"] as const).map(key => <label key={key} className="block space-y-1 text-sm">{labels[key === "unitPriceInput" ? "unitPrice" : key === "discountInput" ? "lineDiscount" : "quantity"]}<Input type="number" value={row[key]} required max={key === "quantity" ? 1_000_000 : undefined} min={key === "quantity" ? 1 : 0} step={key === "quantity" || minorUnitsOf(currency) === 0 ? 1 : 0.01} onChange={event => change(index, key, event.target.value)} /></label>)}</div>{row.currency !== currency && <p role="alert" className="text-sm text-destructive">{labels.currencyHelp} ({row.currency})</p>}<Button type="button" variant="outline" onClick={() => void refreshLine(index)}>{labels.refreshCatalog}</Button><Button type="button" variant="outline" onClick={() => onChange(value.filter((_, i) => i !== index))}>{labels.remove}</Button></li>)}</ol>
    <Input aria-label={labels.chooseVariant} value={query} onChange={event => setQuery(event.target.value)} />{error && <p role="alert" className="text-sm">{labels.unavailable}<Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.reload}</Button></p>}<ul className="max-h-40 space-y-1 overflow-auto">{choices.filter(row => row.currency === currency).map(row => <li key={row.id}><Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" disabled={disabled || busy || value.length >= 50} onClick={() => void add(row)}>{row.productName} · {row.label}{row.sku ? ` · ${row.sku}` : ""}</Button></li>)}</ul>
  </fieldset>;
}
