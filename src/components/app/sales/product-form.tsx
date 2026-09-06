"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/config";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getCatalogDictionary } from "@/lib/i18n/catalog-dictionary";
import { EntityForm } from "../entity-form";
import { FormSelect } from "../record-sheet/form-select";
import { crmRequest, type CrmRecord } from "../record-types";
import { PackageEditor, type PackageChoice } from "./package-editor";
import { VariantFields, variantDraft, variantInput } from "./variant-fields";
export function ProductForm({ record: initialRecord, labels, onSaved, onCancel, readOnly, locale = "vi" }: { record?: CrmRecord; labels: CrmDictionary; onSaved: (id: string) => void; onCancel: () => void; readOnly?: boolean; locale?: AppLocale }) {
  const catalog = getCatalogDictionary(locale);
  const [record, setRecord] = useState(initialRecord); const [formRevision, setFormRevision] = useState(0); const [conflict, setConflict] = useState(false); const [reloading, setReloading] = useState(false); const [reloadError, setReloadError] = useState(false);
  const [kind, setKind] = useState(String(record?.kind ?? "product")); const [category, setCategory] = useState(String(record?.categoryId ?? "")); const [categoryChanged, setCategoryChanged] = useState(false);
  const [variant, setVariant] = useState(() => variantDraft()); const [components, setComponents] = useState<PackageChoice[]>(() => (record?.packageComponents ?? []) as PackageChoice[]); const [componentsChanged, setComponentsChanged] = useState(false);
  const [categories, setCategories] = useState<{ id: string; label: string; archivedAt: string | null }[]>(); const [failed, setFailed] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { const controller = new AbortController(); void crmRequest<{ categories: { id: string; label: string; archivedAt: string | null }[] }>("/api/crm/product-categories", { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setCategories(data.categories); setFailed(false); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [revision]);
  return <div className="space-y-4">{failed && <p role="alert">{labels.error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.retry}</Button></p>}
    <EntityForm key={formRevision} entity="product" onConflict={() => { if (record) setConflict(true); }} record={record} labels={labels} onSaved={onSaved} onCancel={onCancel} readOnly={readOnly || failed || !categories || conflict || reloading}
      renderBuiltin={({ key, id, disabled }) => key === "kind" ? <FormSelect id={id} value={kind} onValueChange={setKind} disabled={disabled || Boolean(record)} options={(["product", "service", "package"] as const).map(value => ({ value, label: catalog[value] }))} /> : key === "categoryId" ? <FormSelect id={id} value={category} onValueChange={value => { setCategory(value); setCategoryChanged(true); }} disabled={disabled || !categories} options={[{ value: "", label: catalog.none }, ...(categories ?? []).map(row => ({ value: row.id, label: `${row.label}${row.archivedAt ? ` · ${labels.archived}` : ""}`, disabled: Boolean(row.archivedAt) }))]} /> : undefined}
      prepareInput={data => { const next = { ...data }; if (!record) { next.kind = kind; next.initialVariant = variantInput(variant); } else delete next.kind; if (Object.hasOwn(data, "categoryId") && (!record || categoryChanged)) next.categoryId = category || null; else delete next.categoryId; if (kind === "package" && (!record || componentsChanged)) next.packageComponents = components.map(({ componentVariantId, quantity }) => ({ componentVariantId, quantity })); return next; }}
      extraFields={<div className="space-y-5">{!record && <section className="space-y-3 rounded-md border p-4"><h3 className="font-medium">{catalog.initialVariant}</h3><p className="text-xs text-muted-foreground">{catalog.requiredPrice}</p><VariantFields value={variant} onChange={setVariant} labels={catalog} disabled={readOnly} /></section>}{kind === "package" && <PackageEditor value={components} onChange={value => { setComponents(value); setComponentsChanged(true); }} labels={catalog} disabled={readOnly} productId={record?.id} />}</div>}
    />
    {conflict && record && <div className="space-y-3 rounded-md border p-4"><p className="text-sm">{catalog.conflict} {catalog.reloadHelp}</p>{reloadError && <p role="alert" className="text-sm text-destructive">{labels.error}</p>}<Button variant="outline" disabled={reloading} onClick={async () => {
      setReloading(true); setReloadError(false);
      try {
        const [next, choices] = await Promise.all([crmRequest<CrmRecord>(`/api/crm/products/${record.id}`), crmRequest<{ categories: { id: string; label: string; archivedAt: string | null }[] }>("/api/crm/product-categories")]);
        setRecord(next); setKind(String(next.kind)); setCategory(String(next.categoryId ?? "")); setCategoryChanged(false); setComponents((next.packageComponents ?? []) as PackageChoice[]); setComponentsChanged(false); setCategories(choices.categories); setConflict(false); setFormRevision(value => value + 1);
      } catch { setReloadError(true); } finally { setReloading(false); }
    }}>{catalog.reload}</Button></div>}
  </div>;
}
