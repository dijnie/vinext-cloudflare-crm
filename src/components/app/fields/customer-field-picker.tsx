"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { crmRequest, recordName, type CrmRecord, type ListData } from "../record-types";

export function CustomerFieldPicker({ id, value, onChange, labels, disabled, required }: { id: string; value: string | null; onChange: (value: string | null) => void; labels: CrmDictionary; disabled?: boolean; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CrmRecord[]>([]);
  const [selected, setSelected] = useState<CrmRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setSelected(null);
    if (!value) { setDetailLoading(false); return; }
    const controller = new AbortController(); setDetailLoading(true);
    crmRequest<CrmRecord>(`/api/crm/contacts/${encodeURIComponent(value)}`, { signal: controller.signal }).then(setSelected).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [value, revision]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setError(false); setRows([]);
    const timer = setTimeout(() => { crmRequest<ListData>(`/api/crm/contacts?${new URLSearchParams({ q: query, pageSize: "25" })}`, { signal: controller.signal }).then(result => { setRows(result.rows); }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, revision]);
  return <div className="min-w-0 space-y-1"><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button id={id} type="button" role="combobox" aria-expanded={open} aria-controls={`${id}-choices`} aria-busy={detailLoading} variant="outline" disabled={disabled} className="w-full justify-start overflow-hidden text-left"><span className="truncate">{selected ? `${recordName(selected)}${selected.archivedAt ? ` · ${labels.archived}` : ""}` : value ? detailLoading ? labels.loading : labels.missing : labels.custom.chooseCustomer}</span></Button></PopoverTrigger><PopoverContent className="w-[min(320px,calc(100vw-32px))] p-0" align="start"><Command shouldFilter={false}><CommandInput aria-label={labels.custom.searchCustomers} placeholder={labels.custom.searchCustomers} value={query} onValueChange={setQuery} /><CommandList id={`${id}-choices`}>
    {loading ? <p role="status" className="p-3 text-xs">{labels.loading}</p> : <><CommandEmpty>{labels.empty}</CommandEmpty>{!required && <CommandItem value="__none__" onSelect={() => { onChange(null); setOpen(false); }}>{labels.none}</CommandItem>}{rows.map(row => <CommandItem key={row.id} value={row.id} onSelect={() => { setSelected(row); onChange(row.id); setOpen(false); }}>{recordName(row)}</CommandItem>)}</>}
  </CommandList></Command></PopoverContent></Popover>{error && <div role="alert" className="text-xs text-destructive">{labels.error}<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setRevision(previous => previous + 1)}>{labels.retry}</Button></div>}</div>;
}
