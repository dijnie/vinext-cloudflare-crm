"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderDictionary } from "@/lib/i18n/order-dictionary";
import { crmRequest, recordName, type CrmRecord } from "../record-types";
export function OrderContactPicker({ value, onChange, labels, disabled, id }: { value: CrmRecord | null; onChange: (value: CrmRecord) => void; labels: OrderDictionary; disabled?: boolean; id?: string }) {
  const [query, setQuery] = useState(""); const [rows, setRows] = useState<CrmRecord[]>([]); const [error, setError] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => { void crmRequest<{ rows: CrmRecord[] }>(`/api/crm/contacts?q=${encodeURIComponent(query)}&pageSize=30`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setRows(data.rows); setError(false); } }).catch(() => { if (!controller.signal.aborted) setError(true); }); }, 250); return () => { controller.abort(); clearTimeout(timer); }; }, [query, revision]);
  return <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">{value && <p className="break-words text-sm">{labels.selected}: {recordName(value)}</p>}<Input id={id} aria-label={labels.chooseCustomer} value={query} onChange={event => setQuery(event.target.value)} disabled={disabled} />{error && <p role="alert" className="text-sm">{labels.unavailable}<Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.reload}</Button></p>}<ul className="max-h-40 space-y-1 overflow-auto">{rows.map(row => <li key={row.id}><Button type="button" variant={value?.id === row.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal text-left" disabled={disabled} onClick={() => onChange(row)}>{recordName(row)}{row.email ? ` · ${row.email}` : ""}</Button></li>)}</ul></div>;
}
