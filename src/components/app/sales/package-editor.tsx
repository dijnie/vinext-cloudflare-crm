"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogDictionary } from "@/lib/i18n/catalog-dictionary";
import type { ProductPackageComponentInput } from "@/lib/services/catalog/product-contract";
import { crmRequest } from "../record-types";
export type PackageChoice = ProductPackageComponentInput & { productName?: string; variantLabel?: string; archivedAt?: string | null; productArchivedAt?: string | null };
type VariantChoice = { id: string; productId: string; productName: string; label: string; archivedAt: string | null };
export function PackageEditor({ value, onChange, labels, disabled, productId }: { value: PackageChoice[]; onChange: (value: PackageChoice[]) => void; labels: CatalogDictionary; disabled?: boolean; productId?: string }) {
  const [query, setQuery] = useState(""); const [options, setOptions] = useState<VariantChoice[]>([]); const [error, setError] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(() => { void crmRequest<{ rows: VariantChoice[] }>(`/api/crm/products/variants?q=${encodeURIComponent(query)}&pageSize=30`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setOptions(data.rows); setError(false); } }).catch(() => { if (!controller.signal.aborted) setError(true); }); }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, reload]);
  return <fieldset className="space-y-3" disabled={disabled}><legend className="font-medium">{labels.components}</legend><p className="text-xs text-muted-foreground">{labels.componentHelp}</p>
    <ul className="space-y-2">{value.map((row, index) => <li key={row.componentVariantId} className="space-y-2 rounded-md border p-3"><p className="break-words text-sm">{row.productName || row.componentVariantId} · {row.variantLabel}{(row.archivedAt || row.productArchivedAt) && ` · ${labels.archived}`}</p><div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm">{labels.quantity}<Input type="number" min={1} max={1_000_000} step={1} required value={row.quantity} onChange={event => onChange(value.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label><Button type="button" variant="outline" onClick={() => onChange(value.filter((_, i) => i !== index))}>{labels.remove}</Button></div></li>)}</ul>
    <label className="block text-sm">{labels.chooseComponent}<Input value={query} onChange={event => setQuery(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm">{labels.unavailable}<Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>{labels.reload}</Button></p>}
    <ul className="max-h-48 space-y-1 overflow-auto">{options.filter(row => row.productId !== productId && !row.archivedAt && !value.some(selected => selected.componentVariantId === row.id)).map(row => <li key={row.id}><Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" disabled={disabled || value.length >= 100} onClick={() => onChange([...value, { componentVariantId: row.id, quantity: 1, productName: row.productName, variantLabel: row.label }])}>{row.productName} · {row.label}</Button></li>)}</ul>
  </fieldset>;
}
