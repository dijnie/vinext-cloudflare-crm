"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/config";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getCatalogDictionary } from "@/lib/i18n/catalog-dictionary";
import { getOrderDictionary } from "@/lib/i18n/order-dictionary";
import { formatMinor } from "@/lib/services/currencies/currency-catalog";
import { productVariantCreateInputSchema, type productVariantOutputSchema } from "@/lib/services/catalog/product-contract";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { useModules } from "../module-provider";
import { crmRequest, requestError, type CrmRecord } from "../record-types";
import { RecordDetails } from "../record-sheet/record-details";
import { RecordLink } from "../record-sheet/record-link";
import { VariantFields, variantDraft, variantInput } from "./variant-fields";
type Variant = z.infer<typeof productVariantOutputSchema>;
function VariantEditor({ productId, initial, locale, crm, disabled, onDone, onReload }: { productId: string; initial?: Variant; locale: AppLocale; crm: CrmDictionary; disabled: boolean; onDone: () => void; onReload: (record: CrmRecord) => void }) {
  const labels = getCatalogDictionary(locale); const [baseline, setBaseline] = useState(initial); const [draft, setDraft] = useState(() => variantDraft(initial)); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stale, setStale] = useState(false);
  async function save() {
    if (disabled || busy || stale) return; setError("");
    let data; try { data = productVariantCreateInputSchema.parse(variantInput(draft)); } catch { setError(crm.invalid); return; }
    setBusy(true); try { await crmRequest(`/api/crm/products/${productId}/variants${baseline ? `/${baseline.id}` : ""}`, { method: baseline ? "PATCH" : "POST", body: JSON.stringify(baseline ? { action: "update", data: { ...data, expectedRevision: baseline.revision } } : data) }); invalidateCrm("product"); onDone(); } catch (reason) { setError(requestError(reason, crm)); setStale(Boolean(baseline) && reason instanceof Error && reason.message === "409"); } finally { setBusy(false); }
  }
  async function reload() { setBusy(true); try { const record = await crmRequest<CrmRecord & { variants: Variant[] }>(`/api/crm/products/${productId}`); const value = record.variants.find(row => row.id === baseline?.id); if (!value) throw new Error("404"); setBaseline(value); setDraft(variantDraft(value)); onReload(record); setStale(false); setError(""); } catch (reason) { setError(requestError(reason, crm)); } finally { setBusy(false); } }
  return <form className="space-y-4 rounded-md border p-4" onSubmit={event => { event.preventDefault(); void save(); }}><h4 className="font-medium">{initial ? labels.editVariant : labels.addVariant}</h4><VariantFields value={draft} onChange={setDraft} labels={labels} disabled={busy || disabled || stale} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{stale && <div className="space-y-2"><p className="text-xs">{labels.reloadHelp}</p><Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>{labels.reload}</Button></div>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || disabled || stale}>{crm.save}</Button><Button type="button" variant="outline" disabled={busy} onClick={onDone}>{crm.cancel}</Button></div></form>;
}
export function ProductSheet({ record, locale, labels: crm, readOnly }: { record: CrmRecord; locale: AppLocale; labels: CrmDictionary; readOnly?: boolean }) {
  const params = useParams();
  const [current, setCurrent] = useState(record);
  useEffect(() => setCurrent(record), [record]);
  const labels = getCatalogDictionary(locale), orderLabels = getOrderDictionary(locale), modules = useModules(); const disabled = Boolean(readOnly || !modules.isEnabled("product") || current.archivedAt);
  const [editing, setEditing] = useState<string>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stale, setStale] = useState(false);
  const variants = (current.variants ?? []) as Variant[];
  const components = (current.packageComponents ?? []) as { componentVariantId: string; quantity: number; productId: string; productName: string; variantLabel: string; archivedAt: string | null; productArchivedAt: string | null }[];
  async function archive(variant: Variant) { setBusy(true); setError(""); try { await crmRequest(`/api/crm/products/${current.id}/variants/${variant.id}`, { method: "PATCH", body: JSON.stringify({ action: variant.archivedAt ? "restore" : "archive", expectedRevision: variant.revision }) }); invalidateCrm("product"); } catch (reason) { setError(requestError(reason, crm)); setStale(reason instanceof Error && reason.message === "409"); } finally { setBusy(false); } }
  return <><RecordDetails entity="product" readOnly={disabled} record={current} locale={locale} labels={crm} /><section className="space-y-4 border-t p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{labels.variants}</h3><Button variant="outline" disabled={disabled || busy || Boolean(editing) || stale} onClick={() => setEditing("new")}>{labels.addVariant}</Button></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{stale && <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { setCurrent(await crmRequest<CrmRecord>(`/api/crm/products/${current.id}`)); setStale(false); setError(""); invalidateCrm("product"); } catch (reason) { setError(requestError(reason, crm)); } finally { setBusy(false); } }}>{labels.reload}</Button>}
    <ul className="space-y-3">{variants.map(variant => <li key={variant.id} className="space-y-3 rounded-md border p-4" data-variant-id={variant.id}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 max-w-full"><h4 className="break-words font-medium">{variant.label}</h4><p className="break-words text-xs text-muted-foreground">{[variant.isDefault ? labels.defaultVariant : null, variant.sku, variant.archivedAt ? labels.archived : null].filter(Boolean).join(" · ")}</p></div><p className="tabular-nums">{formatMinor(variant.priceMinor, variant.currency, locale)}</p></div><dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-sm"><dt>{labels.cost}</dt><dd>{variant.costMinor === null ? "—" : formatMinor(variant.costMinor, variant.currency, locale)}</dd><dt>{labels.duration}</dt><dd>{variant.durationMinutes ?? "—"}</dd>{Object.entries(variant.attributes).map(([key, value]) => <div key={key} className="contents"><dt className="break-words text-muted-foreground">{key}</dt><dd className="break-words">{value}</dd></div>)}</dl><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={disabled || busy || Boolean(editing)} onClick={() => setEditing(variant.id)}>{crm.edit}</Button><Button asChild size="sm" variant="ghost"><Link href={`/${locale}/${String(params.slug)}/inventory?variantId=${variant.id}`}>{orderLabels.inventory}</Link></Button><Button size="sm" variant="outline" disabled={disabled || busy || Boolean(editing) || stale || variant.isDefault && !variant.archivedAt} title={variant.isDefault ? labels.defaultProtected : undefined} onClick={() => void archive(variant)}>{variant.archivedAt ? labels.restore : labels.archive}</Button></div></li>)}</ul>
    {editing && <VariantEditor key={editing} productId={current.id} initial={variants.find(row => row.id === editing)} locale={locale} crm={crm} disabled={disabled} onReload={setCurrent} onDone={() => setEditing(undefined)} />}
  </section>{current.kind === "package" && <section className="space-y-3 border-t p-5"><h3 className="font-medium">{labels.components}</h3><p className="text-xs text-muted-foreground">{labels.componentHelp}</p><ul className="space-y-2">{components.map(row => <li key={row.componentVariantId} className="flex flex-wrap gap-x-2 text-sm"><RecordLink entity="product" id={row.productId}>{row.productName}</RecordLink><span>{row.variantLabel} · {row.quantity} {labels.units}{(row.archivedAt || row.productArchivedAt) && ` · ${labels.archived}`}</span></li>)}</ul>{!components.length && <p className="text-sm text-muted-foreground">{labels.none}</p>}</section>}</>;
}
