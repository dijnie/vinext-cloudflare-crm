"use client";
import { useDealStages } from "./deal-stage-provider";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Archive, ArrowsVertical, ChevronDown, Column, Filter, Search } from "@carbon/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { changeListState, entityColumns, type EntityType } from "@/lib/listing/list-state";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { isSortableFieldType } from "@/lib/services/custom-fields/field-sort-contracts";
import type { FieldDefinition } from "@/lib/services/custom-fields/field-contracts";
import { fieldLabel, type Facet } from "./record-types";
import { FieldConditionsDialog } from "./fields/field-conditions-dialog";
import { fieldCriteriaSchema } from "@/lib/services/custom-fields/field-filter-contracts";
import { pushListQuery } from "./list-navigation";

export const selectClass = "h-8 max-w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
export function listSortKeys(entity: EntityType, customFields: FieldDefinition[] = []): string[] {
  const builtIn = entity === "company" ? ["name", "domain", "industry", "createdAt", "lastActivityAt", "archivedAt"] : entity === "contact" ? ["firstName", "lastName", "email", "title", "createdAt", "lastActivityAt", "archivedAt"] : ["name", "stage", "amount", "expectedCloseAt", "createdAt", "lastActivityAt", "archivedAt"];
  return [...builtIn, ...customFields.filter(field => !field.archivedAt && isSortableFieldType(field.type)).map(field => `field:${field.key}`)];
}

function FacetMenu({ label, options, selected, labels, onChange }: { label: string; options: Facet[]; selected: string[]; labels: CrmDictionary; onChange: (values: string[]) => void }) {
  return <DropdownMenuSub><DropdownMenuSubTrigger><span className="flex-1">{label}</span>{selected.length > 0 && <span className="tabular-nums opacity-60">({selected.length})</span>}</DropdownMenuSubTrigger><DropdownMenuSubContent className="min-w-52 overflow-hidden"><Command><CommandInput placeholder={`${labels.search}…`} aria-label={`${labels.search} ${label}`} onKeyDown={event => event.stopPropagation()} /><CommandList><CommandEmpty>{labels.empty}</CommandEmpty><CommandGroup>{options.map(option => <CommandItem key={option.value} value={`${option.label ?? option.value} ${option.value}`} onSelect={() => onChange(selected.includes(option.value) ? selected.filter(value => value !== option.value) : [...selected, option.value])}><Checkbox className="pointer-events-none" checked={selected.includes(option.value)} aria-hidden="true" tabIndex={-1} /><span className="flex-1 truncate">{option.label ?? option.value}</span><span className="text-muted-foreground tabular-nums">{option.count}</span></CommandItem>)}</CommandGroup></CommandList></Command></DropdownMenuSubContent></DropdownMenuSub>;
}

export function ListToolbar({ entity, labels, facets, columns, customFields = [], fieldFacets, actions }: { entity: EntityType; labels: CrmDictionary; facets?: Record<string, Facet[]>; columns: readonly string[]; customFields?: FieldDefinition[]; fieldFacets?: Record<string, Facet[]>; actions?: ReactNode }) {
  const stageCatalog = useDealStages();
  const path = usePathname(); const search = useSearchParams(); const controlsId = useId();
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const committed = search.get("q") ?? "";
  const [draft, setDraft] = useState(committed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setDraft(committed); if (timer.current) clearTimeout(timer.current); }, [committed]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function change(changes: Record<string, string | string[] | null>) {
    // Read current history so delayed typing never restores stale filters or sheet state.
    pushListQuery(`${path}?${changeListState(new URLSearchParams(window.location.search), changes)}`);
  }
  const filterKeys = entity === "company" ? ["owner", "industry"] : entity === "contact" ? ["owner", "company", "title"] : ["owner", "company", "stage"];
  const selectedFields: Record<string, string[]> = JSON.parse(search.get("fields") ?? "{}");
  const availableColumns = [...entityColumns[entity], ...customFields.filter(field => !field.archivedAt).map(field => `field:${field.key}`)];
  const filterFields = customFields.filter(field => !field.archivedAt && field.showOnFilter && ["select", "user", "multiselect", "customer"].includes(field.type));
  let criteria = fieldCriteriaSchema.parse([]);
  try { const parsed = fieldCriteriaSchema.safeParse(JSON.parse(search.get("criteria") ?? "[]")); if (parsed.success) criteria = parsed.data; } catch { /* The server reports invalid list queries. */ }
  const activeCount = filterKeys.filter(key => search.has(key)).length + Object.keys(selectedFields).length + criteria.length;
  return <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
    <form className="relative w-full sm:w-64" onSubmit={event => { event.preventDefault(); if (timer.current) clearTimeout(timer.current); change({ q: draft }); }}><Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input aria-label={labels.search} placeholder={`${labels.search} ${labels[entity].toLowerCase()}…`} name="q" value={draft} maxLength={200} autoComplete="off" className="pl-8" onChange={event => { const value = event.target.value; setDraft(value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => change({ q: value }), 250); }} /></form>
    <Button variant="outline" size="sm" className="w-full justify-between sm:hidden" aria-expanded={mobileOpen} aria-controls={controlsId} onClick={() => setMobileOpen(value => !value)}><span className="flex items-center gap-2"><Filter />{labels.filters}{activeCount > 0 && ` (${activeCount})`}</span><ChevronDown /></Button>
    <div id={controlsId} className={`${mobileOpen ? "flex" : "hidden sm:flex"} flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:ml-auto`}>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Filter />{labels.filters}{activeCount > 0 && <span className="opacity-60">({activeCount})</span>}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-48">{filterKeys.map(key => <FacetMenu key={key} label={fieldLabel(key, labels)} options={(facets?.[key] ?? []).map(facet => ({ ...facet, label: key === "stage" ? stageCatalog.label(facet.value) : facet.value === "unassigned" && key === "owner" ? labels.none : facet.label ?? facet.value }))} selected={["industry", "title"].includes(key) ? search.getAll(key) : search.getAll(key).flatMap(value => value.split(","))} labels={labels} onChange={values => change({ [key]: values })} />)}{filterFields.map(field => <FacetMenu key={field.id} label={field.label} options={fieldFacets?.[field.key] ?? []} selected={selectedFields[field.key] ?? []} labels={labels} onChange={values => { const next = { ...selectedFields }; if (values.length) next[field.key] = values; else delete next[field.key]; change({ fields: Object.keys(next).length ? JSON.stringify(next) : null }); }} />)}</DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><ArrowsVertical />{labels.sort}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={search.get("sort") ?? "createdAt"} onValueChange={value => change({ sort: value })}>{listSortKeys(entity, customFields).map(key => <DropdownMenuRadioItem key={key} value={key}>{key.startsWith("field:") ? customFields.find(field => field.key === key.slice(6))?.label ?? key : fieldLabel(key, labels)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /><DropdownMenuRadioGroup value={search.get("dir") ?? "desc"} onValueChange={value => change({ dir: value })}><DropdownMenuRadioItem value="asc">{labels.asc}</DropdownMenuRadioItem><DropdownMenuRadioItem value="desc">{labels.desc}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Column />{labels.columns}<span className="opacity-60">({columns.length})</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52 overflow-hidden"><Command><CommandInput placeholder={`${labels.search}…`} aria-label={`${labels.search} ${labels.columns}`} /><CommandList><CommandEmpty>{labels.empty}</CommandEmpty><CommandGroup>{availableColumns.map(key => { const label = key.startsWith("field:") ? customFields.find(field => field.key === key.slice(6))?.label ?? key : fieldLabel(key, labels); return <CommandItem key={key} value={label} disabled={columns.length === 1 && columns.includes(key)} onSelect={() => change({ columns: (columns.includes(key) ? columns.filter(value => value !== key) : [...columns, key]).join(",") })}><Checkbox className="pointer-events-none" tabIndex={-1} aria-hidden="true" checked={columns.includes(key)} />{label}</CommandItem>; })}</CommandGroup></CommandList></Command></DropdownMenuContent></DropdownMenu>
      <Button variant="outline" size="sm" disabled={!customFields.some(field => !field.archivedAt && field.showOnFilter) && !criteria.length} onClick={() => setConditionsOpen(true)}>{labels.custom.conditions}{criteria.length > 0 && ` (${criteria.length})`}</Button>
      {conditionsOpen && <FieldConditionsDialog fields={customFields} initial={criteria} labels={labels} onClose={() => setConditionsOpen(false)} onApply={next => { change({ criteria: next.length ? JSON.stringify(next) : null }); setConditionsOpen(false); }} />}
      {actions}
      <Button variant={search.get("archived") === "true" ? "contrast" : "outline"} size="sm" aria-pressed={search.get("archived") === "true"} onClick={() => change({ archived: search.get("archived") === "true" ? "false" : "true" })}><Archive />{labels.archived}</Button>
      {(activeCount > 0 || committed || search.has("sort") || search.has("columns") || search.has("view")) && <Button variant="ghost" size="sm" onClick={() => { if (timer.current) clearTimeout(timer.current); setDraft(""); change(Object.fromEntries(["q", "sort", "dir", "archived", ...filterKeys, "fields", "criteria", "columns", "view", "page"].map(key => [key, null]))); }}>{labels.reset}</Button>}
    </div>
  </div>;
}
