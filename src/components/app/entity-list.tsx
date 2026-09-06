"use client";
import { pushListQuery } from "./list-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Add, ChevronLeft, ChevronRight } from "@carbon/icons-react";
import { getListInterfaceDictionary } from "@/lib/i18n/list-interface-dictionary";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { changeListState, entityColumns, entityPaths, listApiSearch, parseListState, type EntityType } from "@/lib/listing/list-state";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import type { AppLocale } from "@/lib/i18n/config";
import { ListStageMenu } from "./list-stage-menu";
import { DataTable } from "./data-table";
import { ListToolbar, selectClass, listSortKeys } from "./list-toolbar";
import { BulkActions } from "./bulk-actions";
import { EntityForm } from "./entity-form";
import { FieldsSheet } from "./fields/fields-sheet";
import { customFieldValue } from "./fields/field-columns";
import { SavedViewsMenu } from "./saved-views-menu";
import { RecordLink } from "./record-sheet/record-link";
import { crmRequest, displayValue, fieldLabel, recordName, type CrmRecord, type ListData } from "./record-types";
import { useCrmInvalidation } from "./use-crm-invalidation";

const emptyRows: CrmRecord[] = [];

export function EntityList({ entity, initialData, initialQueryKey, locale }: { entity: EntityType; initialData: ListData; initialQueryKey: string; locale: AppLocale }) {
  const path = usePathname(); const search = useSearchParams(); const labels = getCrmDictionary(locale); const listLabels = getListInterfaceDictionary(locale);
  const state = parseListState(entity, new URLSearchParams(search.toString())); const query = listApiSearch(new URLSearchParams(search.toString()));
  const queryKey = `${entity}:${JSON.stringify(state.list)}`;
  const mutationRevision = useCrmInvalidation();
  const initialSnapshot = useRef({ key: initialQueryKey, eligible: true });
  const [data, setData] = useState(initialData); const [error, setError] = useState(false); const [fetching, setFetching] = useState(false); const [revision, setRevision] = useState(0);
  const [dataKey, setDataKey] = useState(initialQueryKey);
  const loading = fetching || dataKey !== queryKey;
  const currentRows = dataKey === queryKey ? data.rows : emptyRows;
  const [selection, setSelection] = useState<RowSelectionState>({}); const [creating, setCreating] = useState(false);
  const [partialFailure, setPartialFailure] = useState(false);
  useEffect(() => { setSelection({}); }, [query, entity]);
  useEffect(() => {
    // Only the mount snapshot is trusted: a later RSC response may predate a mutation.
    if (initialSnapshot.current.eligible && initialSnapshot.current.key === queryKey && revision === 0 && mutationRevision === 0) return;
    initialSnapshot.current.eligible = false;
    const controller = new AbortController();
    setFetching(true); setError(false);
    crmRequest<ListData>(`/api/crm/${entityPaths[entity]}?${query}`, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setData(value); setDataKey(queryKey);
      setSelection(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => value.rows.some(row => row.id === id))));
    }).catch(() => {
      if (!controller.signal.aborted) {
        setData({ rows: [], total: 0, facets: {}, customFields: [], fieldFacets: {}, fieldUserLabels: {} });
        setDataKey(queryKey); setSelection({}); setError(true);
      }
    }).finally(() => { if (!controller.signal.aborted) setFetching(false); });
    return () => controller.abort();
  }, [query, queryKey, entity, revision, mutationRevision]);
  const customFields = data.customFields?.filter(field => !field.archivedAt) ?? [];
  const configuredColumns = state.columns?.length ? state.columns : [...entityColumns[entity], ...customFields.filter(field => field.showOnTable).map(field => `field:${field.key}`)];
  const visibleColumns: readonly string[] = configuredColumns.filter(key => !key.startsWith("field:") || customFields.some(field => `field:${field.key}` === key));
  const columns = useMemo<ColumnDef<CrmRecord>[]>(() => [{
    id: "select",
    header: ({ table }) => <Checkbox aria-label={labels.selectPage} disabled={table.options.enableRowSelection === false || table.getRowModel().rows.length === 0} checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false} onCheckedChange={value => table.toggleAllRowsSelected(value === true)} />,
    cell: ({ row }) => <Checkbox aria-label={`${labels.select} ${recordName(row.original)}`} disabled={!row.getCanSelect()} checked={row.getIsSelected()} onCheckedChange={value => row.toggleSelected(value === true)} />,
  }, ...visibleColumns.map(key => {
    const field = key.startsWith("field:") ? customFields.find(definition => definition.key === key.slice(6)) : undefined;
    return { id: key, header: field?.label ?? fieldLabel(key, labels), cell: ({ row }: { row: { original: CrmRecord } }) => {
      const record = row.original;
      if (field) return <span className="block max-w-80 whitespace-pre-wrap break-words tabular-nums">{customFieldValue(field, record.fields?.[field.key], locale, labels, data.fieldUserLabels, data.fieldCustomerLabels, data.fieldFileLabels)}</span>;
      if (key === "name" || key === "firstName") return <div className="flex min-w-0 items-center gap-2.5">{entity !== "deal" && <Avatar className={entity === "company" ? "size-7 rounded-md" : "size-7"}><AvatarFallback className={entity === "company" ? "rounded-md text-[10px]" : "text-[10px]"}>{recordName(record).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</AvatarFallback></Avatar>}<div className="min-w-0 [&_a]:block [&_a]:truncate [&_a]:text-foreground"><RecordLink entity={entity} id={record.id}>{recordName(record)}</RecordLink>{entity === "company" && typeof record.contactCount === "number" && typeof record.openDealCount === "number" && <div className="mt-0.5 text-[10px] text-muted-foreground">{record.contactCount} {labels.contact.toLowerCase()} · {record.openDealCount} {listLabels.openDeals}</div>}</div></div>;
      if (key === "company" && record.company) return <span className="[&_a]:text-foreground"><RecordLink entity="company" id={record.company.id}>{record.company.name}</RecordLink></span>;
      if (key === "owner" && record.owner) { const name = record.owner.name || record.owner.email || "—"; return <span className="flex items-center gap-2"><Avatar className="size-5"><AvatarFallback className="text-[9px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className="truncate">{name}</span></span>; }
      if (key === "stage") return <ListStageMenu id={record.id} stage={String(record.stageId ?? "")} disabled={Boolean(record.archivedAt)} labels={labels} />;
      return <span className={`tabular-nums ${key.endsWith("At") || key === "domain" || key === "email" ? "text-muted-foreground" : ""}`}>{displayValue(record, key, locale, labels)}</span>;
    } };
  }), ...(!visibleColumns.includes("name") && !visibleColumns.includes("firstName") ? [{ id: "open", header: labels.details, cell: ({ row }: { row: { original: CrmRecord } }) => <RecordLink entity={entity} id={row.original.id}>{labels.details}</RecordLink> }] : [])], [visibleColumns.join(","), entity, locale, data.customFields, data.fieldUserLabels, data.fieldCustomerLabels, data.fieldFileLabels]);
  const table = useReactTable({ data: currentRows, columns, getCoreRowModel: getCoreRowModel(), getRowId: row => row.id, enableRowSelection: !loading && !error && dataKey === queryKey, state: { rowSelection: selection }, onRowSelectionChange: setSelection });
  const ids = loading || error ? [] : currentRows.filter(row => selection[row.id]).map(row => row.id);
  function change(changes: Record<string, string | null>) { pushListQuery(`${path}?${changeListState(new URLSearchParams(search.toString()), changes)}`); }
  return <section className="mx-auto flex min-h-0 w-full min-w-0 max-w-7xl flex-1 flex-col gap-6" aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-medium tracking-tight md:text-3xl" tabIndex={-1} data-list-heading>{labels[entity]}</h1><p className="mt-2 text-sm text-muted-foreground">{listLabels.description[entity]}</p></div><div className="flex flex-wrap gap-2"><FieldsSheet entity={entity} labels={labels} /><Button size="sm" onClick={() => setCreating(true)}><Add />{labels.add}</Button></div></div>
    <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div className={ids.length > 0 ? "hidden" : ""}><ListToolbar entity={entity} labels={labels} facets={data.facets} columns={visibleColumns} customFields={customFields} fieldFacets={data.fieldFacets} actions={<SavedViewsMenu entity={entity} labels={labels} />} /></div>
    {ids.length > 0 && <BulkActions entity={entity} ids={ids} archived={state.list.archived} labels={labels} onSuccess={() => { setSelection({}); setPartialFailure(false); }} onPartial={() => setPartialFailure(true)} />}
    {partialFailure && <p role="alert" className="text-sm text-destructive">{labels.partial}</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{labels.error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.retry}</Button><Button variant="outline" onClick={() => pushListQuery(path)}>{labels.reset}</Button></div>}
    <div className="min-h-64 flex-1 overflow-auto rounded-lg border bg-card"><DataTable table={table} emptyLabel={loading ? labels.loading : labels.empty} sort={state.list.sort} dir={state.list.dir} sortable={listSortKeys(entity, customFields)} labels={labels} columnClasses={{ name: "w-[28%]", firstName: "w-[28%]", lastName: "hidden lg:table-cell", domain: "hidden md:table-cell", industry: "hidden lg:table-cell", owner: "hidden md:table-cell", email: "hidden md:table-cell", title: "hidden lg:table-cell", createdAt: "hidden sm:table-cell", amount: "hidden sm:table-cell", currency: "hidden lg:table-cell", expectedCloseAt: "hidden lg:table-cell" }} onSort={(key, direction) => change({ sort: key, dir: direction })} onRowOpen={(record, trigger) => { if (!search.get("recordId")) window.dispatchEvent(new CustomEvent("crm:record-trigger", { detail: trigger })); change({ recordType: entity, recordId: record.id, tab: "details" }); }} /></div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span role="status" className="tabular-nums">{data.total > 0 ? `${Math.min(data.total, (state.list.page - 1) * state.list.pageSize + 1)}–${Math.min(state.list.page * state.list.pageSize, data.total)} / ${new Intl.NumberFormat(locale).format(data.total)} ${labels.total}` : labels.empty}{loading ? ` · ${labels.loading}` : ""}</span><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2">{labels.pageSize}<select className={selectClass} value={state.list.pageSize} onChange={event => change({ pageSize: event.target.value })}>{Array.from(new Set([25, 50, 100, state.list.pageSize])).sort((a,b) => a-b).map(size => <option key={size}>{size}</option>)}</select></label>{data.total > state.list.pageSize && <><Button size="sm" variant="ghost" disabled={state.list.page <= 1 || loading} onClick={() => change({ page: String(state.list.page - 1) })}><ChevronLeft />{labels.previous}</Button><span>{state.list.page} / {Math.max(1, Math.ceil(data.total / state.list.pageSize))}</span><Button size="sm" variant="contrast" disabled={state.list.page * state.list.pageSize >= data.total || loading} onClick={() => change({ page: String(state.list.page + 1) })}>{labels.next}<ChevronRight /></Button></>}</div></div>
    </div>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent variant="sheet" closeLabel={labels.close}><DialogTitle className="border-b p-5 pr-14">{labels.add} · {labels[entity]}</DialogTitle><div className="min-h-0 flex-1 overflow-auto p-5"><EntityForm entity={entity} labels={labels} onCancel={() => setCreating(false)} onSaved={id => { setCreating(false); change({ recordType: entity, recordId: id, tab: "details" }); }} /></div></DialogContent></Dialog>
  </section>;
}
