"use client";
import type { FieldDefinition } from "@/modules/fields/field-contracts";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import type { Facet } from "../record-types";

export function FieldFilters({ fields, facets, selected, onChange, labels }: { fields: FieldDefinition[]; facets?: Record<string, Facet[]>; selected: Record<string, string[]>; onChange: (value: Record<string, string[]>) => void; labels: CrmDictionary }) {
  return fields.filter(field => !field.archivedAt && field.showOnFilter && ["select", "user"].includes(field.type)).map(field => <fieldset key={field.id} className="min-w-40"><legend className="text-sm font-medium">{field.label}</legend>{(facets?.[field.key] ?? []).map(facet => <label key={facet.value} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selected[field.key]?.includes(facet.value) ?? false} onChange={event => { const values = selected[field.key] ?? []; const next = { ...selected, [field.key]: event.target.checked ? [...values, facet.value] : values.filter(value => value !== facet.value) }; if (!next[field.key].length) delete next[field.key]; onChange(next); }} />{facet.label ?? facet.value}<span className="text-muted-foreground">({facet.count})</span></label>)}{!facets?.[field.key]?.length && <p className="py-2 text-sm text-muted-foreground">{labels.none}</p>}</fieldset>);
}
