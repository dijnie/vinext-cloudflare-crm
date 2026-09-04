"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { entityPaths, type EntityType } from "@/crm/list-state";
import { invalidateCrm } from "@/crm/invalidation";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import { crmRequest, requestError } from "./record-types";

export function BulkActions({ entity, ids, archived, labels, onSuccess, onPartial }: { entity: EntityType; ids: string[]; archived: boolean; labels: CrmDictionary; onSuccess: () => void; onPartial: () => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try { const result = await crmRequest<{ failed: number }>(`/api/crm/${entityPaths[entity]}`, { method: "PATCH", body: JSON.stringify({ action: archived ? "bulk-restore" : "bulk-archive", ids }) }); setOpen(false); onSuccess(); if (result.failed) onPartial(); invalidateCrm(entity); }
    catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3"><span role="status" className="text-sm">{ids.length} {labels.selected}</span><Button variant="outline" disabled={!ids.length || ids.length > 100} onClick={() => { setError(""); setOpen(true); }}>{archived ? labels.restore : labels.archive}</Button><Button variant="ghost" onClick={onSuccess}>{labels.clear}</Button><Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent closeLabel={labels.close}><DialogTitle>{archived ? labels.restore : labels.archive}</DialogTitle><DialogDescription>{archived ? labels.restoreConfirm : labels.archiveConfirm} ({ids.length})</DialogDescription>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{labels.cancel}</Button><Button disabled={busy} onClick={submit}>{busy ? labels.loading : labels.confirm}</Button></div></DialogContent></Dialog></div>;
}
