"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeListState, entityColumns, type EntityType } from "@/crm/list-state";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import { fieldLabel, type Facet } from "./record-types";
import type { FieldDefinition } from "@/fields/field-contracts";
import { FieldFilters } from "./fields/field-filters";

export const selectClass = "min-h-11 max-w-full rounded-md border bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
export function ListToolbar({ entity, labels, facets, columns, customFields = [], fieldFacets }: { entity: EntityType; labels: CrmDictionary; facets?: Record<string, Facet[]>; columns: readonly string[]; customFields?: FieldDefinition[]; fieldFacets?: Record<string, Facet[]> }) {
  const router = useRouter(); const path = usePathname(); const search = useSearchParams();
  function change(changes: Record<string, string | string[] | null>) { router.push(`${path}?${changeListState(new URLSearchParams(search.toString()), changes)}`, { scroll: false }); }
  const sortKeys = entity === "company" ? ["name", "domain", "industry", "createdAt", "lastActivityAt", "archivedAt"] : entity === "contact" ? ["firstName", "lastName", "email", "title", "createdAt", "lastActivityAt", "archivedAt"] : ["name", "stage", "amount", "expectedCloseAt", "createdAt", "lastActivityAt", "archivedAt"];
  const filterKeys = entity === "company" ? ["owner", "industry"] : entity === "contact" ? ["owner", "company", "title"] : ["owner", "company", "stage"];
  const selectedFields: Record<string, string[]> = JSON.parse(search.get("fields") ?? "{}");
  const availableColumns = [...entityColumns[entity], ...customFields.filter(field => !field.archivedAt).map(field => `field:${field.key}`)];
  return <div className="space-y-3">
    <form className="flex flex-wrap items-end gap-2" key={search.get("q") ?? ""} onSubmit={event => { event.preventDefault(); change({ q: String(new FormData(event.currentTarget).get("q") ?? "") }); }}><label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">{labels.search}<Input name="q" defaultValue={search.get("q") ?? ""} maxLength={200} className="min-h-11" /></label><Button className="min-h-11" variant="outline" type="submit">{labels.search}</Button></form>
    <div className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-sm">{labels.archived}<select className={selectClass} value={search.get("archived") ?? "false"} onChange={e => change({ archived: e.target.value })}><option value="false">{labels.active}</option><option value="true">{labels.archived}</option></select></label>
      <label className="flex flex-col gap-1 text-sm">{labels.sort}<select className={selectClass} value={search.get("sort") ?? "createdAt"} onChange={e => change({ sort: e.target.value })}>{sortKeys.map(key => <option key={key} value={key}>{fieldLabel(key, labels)}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">{labels.sort}<select aria-label={labels.asc + "/" + labels.desc} className={selectClass} value={search.get("dir") ?? "desc"} onChange={e => change({ dir: e.target.value })}><option value="asc">{labels.asc}</option><option value="desc">{labels.desc}</option></select></label>
      <details className="relative"><summary className="min-h-11 cursor-pointer rounded-md border px-3 py-3 text-sm">{labels.filters}</summary><div className="mt-2 flex flex-wrap gap-4 rounded-lg border bg-background p-3">{filterKeys.map(key => <fieldset key={key} className="min-w-40"><legend className="text-sm font-medium">{fieldLabel(key, labels)}</legend>{(facets?.[key] ?? []).map(facet => { const values = ["industry", "title"].includes(key) ? search.getAll(key) : search.getAll(key).flatMap(v => v.split(",")); return <label key={facet.value} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={values.includes(facet.value)} onChange={e => change({ [key]: e.target.checked ? [...values, facet.value] : values.filter(v => v !== facet.value) })} />{key === "stage" ? labels.stages[facet.value as keyof CrmDictionary["stages"]] ?? facet.label : facet.value === "unassigned" && key === "owner" ? labels.none : facet.label ?? facet.value}<span className="text-muted-foreground">({facet.count})</span></label>; })}{!facets?.[key]?.length && <p className="py-2 text-sm text-muted-foreground">{labels.none}</p>}</fieldset>)}<FieldFilters fields={customFields} facets={fieldFacets} selected={selectedFields} labels={labels} onChange={value => change({ fields: Object.keys(value).length ? JSON.stringify(value) : null })} /></div></details>
      <details><summary className="min-h-11 cursor-pointer rounded-md border px-3 py-3 text-sm">{labels.columns}</summary><div className="mt-2 rounded-lg border bg-background p-3">{availableColumns.map(key => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={columns.includes(key)} disabled={columns.length === 1 && columns.includes(key)} onChange={e => change({ columns: (e.target.checked ? [...columns, key] : columns.filter(v => v !== key)).join(",") })} />{key.startsWith("field:") ? customFields.find(field => field.key === key.slice(6))?.label : fieldLabel(key, labels)}</label>)}</div></details>
      <Button variant="ghost" className="min-h-11" onClick={() => change(Object.fromEntries(["q", "sort", "dir", "archived", ...filterKeys, "fields", "columns", "view", "page"].map(key => [key, null])))}>{labels.reset}</Button>
    </div>
  </div>;
}
