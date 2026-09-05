"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { entityPaths, type EntityType } from "@/modules/crm/list-state";
import { ownershipInputSchema } from "@/modules/crm/contracts/activity-contract";
import { invalidateCrm } from "@/modules/crm/invalidation";
import type { CrmDictionary } from "@/i18n/crm-dictionary";
import { crmRequest, requestError } from "./record-types";
import { OwnerPicker, type OwnerOption } from "./owner-picker";

export function BulkActions({ entity, ids, archived, labels, onSuccess, onPartial }: {
  entity: EntityType; ids: string[]; archived: boolean; labels: CrmDictionary;
  onSuccess: () => void; onPartial: () => void;
}) {
  const [action, setAction] = useState<"archive" | "ownership" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState<OwnerOption | null>(null);
  const validSelection = ids.length > 0 && ids.length <= 100;
  async function submit() {
    if (!validSelection) return;
    const ownership = ownershipInputSchema.safeParse({ entity, ids, ownerMembershipId: owner?.membershipId ?? null });
    if (action === "ownership" && !ownership.success) { setError(labels.invalid); return; }
    setBusy(true); setError("");
    try {
      const result = await crmRequest<{ failed: number }>(
        action === "ownership" ? "/api/crm/ownership" : `/api/crm/${entityPaths[entity]}`,
        { method: "PATCH", body: JSON.stringify(action === "ownership" ? ownership.data : { action: archived ? "bulk-restore" : "bulk-archive", ids }) },
      );
      const surface = action === "ownership" ? "ownership" : entity;
      setAction(null); onSuccess(); if (result.failed) onPartial(); invalidateCrm(surface);
    } catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); }
  }
  const title = action === "ownership" ? labels.activity.reassign : archived ? labels.restore : labels.archive;
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
    <span role="status" className="text-sm">{ids.length} {labels.selected}</span>
    <Button variant="outline" disabled={!validSelection} onClick={() => { setError(""); setAction("archive"); }}>{archived ? labels.restore : labels.archive}</Button>
    <Button variant="outline" disabled={!validSelection} onClick={() => { setError(""); setOwner(null); setAction("ownership"); }}>{labels.activity.reassign}</Button>
    <Button variant="ghost" onClick={onSuccess}>{labels.clear}</Button>
    <Dialog open={action !== null} onOpenChange={value => { if (!busy && !value) setAction(null); }}>
      <DialogContent closeLabel={labels.close}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{action === "ownership" ? labels.activity.reassignDescription : archived ? labels.restoreConfirm : labels.archiveConfirm} ({ids.length})</DialogDescription>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
          {action === "ownership" && <div className="space-y-1">
            <label htmlFor="bulk-owner" className="text-sm">{labels.labels.owner}{entity === "deal" ? " *" : ""}</label>
            <OwnerPicker id="bulk-owner" value={owner} onChange={setOwner} labels={labels} required={entity === "deal"} disabled={busy} />
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setAction(null)}>{labels.cancel}</Button>
            <Button type="submit" disabled={busy || !validSelection}>{busy ? labels.loading : labels.confirm}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
