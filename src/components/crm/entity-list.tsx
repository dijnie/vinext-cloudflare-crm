"use client";
import { pushListQuery } from "./list-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { changeListState, entityColumns, entityPaths, listApiSearch, parseListState, type EntityType } from "@/modules/crm/list-state";
import { getCrmDictionary } from "@/i18n/crm-dictionary";
import type { AppLocale } from "@/i18n/config";
import { DataTable } from "./data-table";
import { ListToolbar, selectClass } from "./list-toolbar";
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
  const path = usePathname(); const search = useSearchParams(); const labels = getCrmDictionary(locale);
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
  const columns = useMemo<ColumnDef<CrmRecord>[]>(() => [{ id: "select", header: ({ table }) => <input type="checkbox" aria-label={labels.selectPage} disabled={table.options.enableRowSelection === false || table.getRowModel().rows.length === 0} checked={table.getIsAllRowsSelected()} ref={node => { if (node) node.indeterminate = table.getIsSomeRowsSelected(); }} onChange={table.getToggleAllRowsSelectedHandler()} className="size-4" />, cell: ({ row }) => <label className="flex min-h-11 min-w-11 items-center justify-center"><input className="size-4" type="checkbox" aria-label={`${labels.select} ${recordName(row.original)}`} disabled={!row.getCanSelect()} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /></label> }, ...visibleColumns.map(key => { const field = key.startsWith("field:") ? customFields.find(definition => definition.key === key.slice(6)) : undefined; return { id: key, header: field?.label ?? fieldLabel(key, labels), cell: ({ row }: { row: { original: CrmRecord } }) => field ? <span className="block max-w-80 whitespace-pre-wrap break-words tabular-nums">{customFieldValue(field, row.original.fields?.[field.key], locale, labels, data.fieldUserLabels)}</span> : key === "name" || key === "firstName" ? <RecordLink entity={entity} id={row.original.id}>{recordName(row.original)}</RecordLink> : key === "company" && row.original.company ? <RecordLink entity="company" id={row.original.company.id}>{row.original.company.name}</RecordLink> : <span className="tabular-nums">{displayValue(row.original, key, locale, labels)}</span> }; }), ...(!visibleColumns.includes("name") && !visibleColumns.includes("firstName") ? [{ id: "open", header: labels.details, cell: ({ row }: { row: { original: CrmRecord } }) => <RecordLink entity={entity} id={row.original.id}>{labels.details}</RecordLink> }] : [])], [visibleColumns.join(","), entity, locale, data.customFields, data.fieldUserLabels]);
  const table = useReactTable({ data: currentRows, columns, getCoreRowModel: getCoreRowModel(), getRowId: row => row.id, enableRowSelection: !loading && !error && dataKey === queryKey, state: { rowSelection: selection }, onRowSelectionChange: setSelection });
  const ids = loading || error ? [] : currentRows.filter(row => selection[row.id]).map(row => row.id);
  function change(changes: Record<string, string | null>) { pushListQuery(`${path}?${changeListState(new URLSearchParams(search.toString()), changes)}`); }
  return <section className="mx-auto min-w-0 max-w-7xl space-y-4" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold" tabIndex={-1} data-list-heading>{labels[entity]}</h1><div className="flex flex-wrap gap-2"><FieldsSheet entity={entity} labels={labels} /><Button className="min-h-11" onClick={() => setCreating(true)}>{labels.add}</Button></div></div>
    <SavedViewsMenu entity={entity} labels={labels} />
    <ListToolbar entity={entity} labels={labels} facets={data.facets} columns={visibleColumns} customFields={customFields} fieldFacets={data.fieldFacets} />
    {ids.length > 0 && <BulkActions entity={entity} ids={ids} archived={state.list.archived} labels={labels} onSuccess={() => { setSelection({}); setPartialFailure(false); }} onPartial={() => setPartialFailure(true)} />}
    {partialFailure && <p role="alert" className="text-sm text-destructive">{labels.partial}</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{labels.error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.retry}</Button><Button variant="outline" onClick={() => pushListQuery(path)}>{labels.reset}</Button></div>}
    <div className="max-w-full overflow-x-auto rounded-lg border bg-background"><DataTable table={table} emptyLabel={loading ? labels.loading : labels.empty} /></div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span role="status">{new Intl.NumberFormat(locale).format(data.total)} {labels.total}{loading ? ` · ${labels.loading}` : ""}</span><div className="flex flex-wrap items-center gap-2"><label>{labels.pageSize} <select className={selectClass} value={state.list.pageSize} onChange={event => change({ pageSize: event.target.value })}>{Array.from(new Set([25, 50, 100, state.list.pageSize])).sort((a,b) => a-b).map(size => <option key={size}>{size}</option>)}</select></label><Button variant="outline" disabled={state.list.page <= 1 || loading} onClick={() => change({ page: String(state.list.page - 1) })}>{labels.previous}</Button><span>{labels.page} {state.list.page} / {Math.max(1, Math.ceil(data.total / state.list.pageSize))}</span><Button variant="outline" disabled={state.list.page * state.list.pageSize >= data.total || loading} onClick={() => change({ page: String(state.list.page + 1) })}>{labels.next}</Button></div></div>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent variant="sheet" closeLabel={labels.close}><DialogTitle className="border-b p-5 pr-14">{labels.add} · {labels[entity]}</DialogTitle><div className="min-h-0 flex-1 overflow-auto p-5"><EntityForm entity={entity} labels={labels} onCancel={() => setCreating(false)} onSaved={id => { setCreating(false); change({ recordType: entity, recordId: id, tab: "details" }); }} /></div></DialogContent></Dialog>
  </section>;
}
