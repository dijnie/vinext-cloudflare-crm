"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FieldDefinition, FieldValue } from "@/fields/field-contracts";
import type { EntityType } from "@/crm/list-state";
import { invalidateCrm } from "@/crm/invalidation";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import { crmRequest, requestError } from "../record-types";
import { FieldEditor } from "./field-editor";

export function RecordFields({ entity, recordId, labels }: { entity: EntityType; recordId: string; labels: CrmDictionary }) {
  const [fields, setFields] = useState<FieldDefinition[]>([]); const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [changed, setChanged] = useState<Record<string, FieldValue>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { const controller = new AbortController(); setStatus("loading"); setError(""); setSaved(false); setChanged({}); Promise.all([crmRequest<FieldDefinition[]>(`/api/crm/fields?entity=${entity}`, { signal: controller.signal }), crmRequest<Record<string, FieldValue>>(`/api/crm/fields/values?entity=${entity}&recordId=${encodeURIComponent(recordId)}`, { signal: controller.signal })]).then(([definitions, stored]) => { setFields(definitions.filter(field => !field.archivedAt && field.showOnSheet)); setValues(stored); setStatus("ready"); }).catch(() => { if (!controller.signal.aborted) setStatus("error"); }); return () => controller.abort(); }, [entity, recordId, revision]);
  async function save() { setBusy(true); setError(""); setSaved(false); try { const stored = await crmRequest<Record<string, FieldValue>>("/api/crm/fields/values", { method: "PATCH", body: JSON.stringify({ entity, recordId, values: changed }) }); setValues(stored); setChanged({}); setSaved(true); invalidateCrm(entity); } catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); } }
  return <section className="space-y-4" aria-busy={status === "loading" || busy}>{status === "loading" && <p role="status">{labels.loading}</p>}{status === "error" && <div role="alert">{labels.error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>{labels.retry}</Button></div>}{status === "ready" && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>{fields.map(field => <FieldEditor key={field.id} field={field} value={Object.hasOwn(changed, field.key) ? changed[field.key] : values[field.key] ?? null} onChange={value => { setChanged(previous => ({ ...previous, [field.key]: value })); setSaved(false); }} labels={labels} disabled={busy} />)}{!fields.length && <p className="text-sm text-muted-foreground">{labels.custom.empty}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{saved && <p role="status" className="text-sm">{labels.custom.saved}</p>}{fields.length > 0 && <Button disabled={busy || !Object.keys(changed).length} type="submit">{busy ? labels.loading : labels.save}</Button>}</form>}</section>;
}
