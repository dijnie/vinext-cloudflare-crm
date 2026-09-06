"use client";
import { useModules } from "../module-provider";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { entityPaths, type EntityType } from "@/lib/listing/list-state";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { DEAL_STAGE_IDS } from "@/lib/services/deals/deal-contract";
import { crmRequest, requestError, type CrmRecord } from "../record-types";
import { OwnerPicker } from "../owner-picker";
import { FormSelect } from "./form-select";

export function InlineRecordSelect({ entity, record, field, shown, labels }: { entity: EntityType; record: CrmRecord; field: "owner" | "stage"; shown: string; labels: CrmDictionary }) {
  const { isEnabled } = useModules();
  const moduleEnabled = isEnabled(entity);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(value: string | null) {
    if (!moduleEnabled) return;
    setBusy(true); setError("");
    try { await crmRequest(`/api/crm/${entityPaths[entity]}/${record.id}`, { method: "PATCH", body: JSON.stringify({ action: "update", data: { [field === "owner" ? "ownerMembershipId" : "stageId"]: value } }) }); setEditing(false); invalidateCrm(entity); if (field === "owner") invalidateCrm("ownership"); }
    catch (reason) { setError(requestError(reason, labels)); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0">{editing ? <div data-inline-record-editor onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setEditing(false); } }}>{field === "owner" ? <OwnerPicker id={`inline-owner-${record.id}`} name="" value={record.owner ?? null} labels={labels} required={entity === "deal"} disabled={busy || !moduleEnabled} onChange={owner => { void save(owner?.membershipId ?? null); }} /> : <FormSelect id={`inline-stage-${record.id}`} value={String(record.stageId ?? "")} disabled={busy || !moduleEnabled} options={DEAL_STAGE_IDS.map(stage => ({ value: stage, label: labels.stages[stage] }))} onValueChange={value => { void save(value); }} />}</div> : <Button variant="ghost" size="sm" className="h-8 w-full justify-start border border-transparent px-2 font-normal hover:border-input hover:bg-muted/40" disabled={!moduleEnabled} aria-label={`${labels.edit}: ${labels.labels[field]}`} onClick={() => setEditing(true)}><span className="truncate">{shown}</span></Button>}{error && <p role="alert" className="px-2 text-xs text-destructive">{error}</p>}</div>;
}
