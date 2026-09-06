"use client";
import { useState } from "react";
import { ChevronDown } from "@carbon/icons-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { invalidateCrm } from "@/lib/listing/invalidation";
import { DEAL_STAGE_IDS } from "@/lib/services/deals/deal-contract";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { crmRequest, requestError } from "./record-types";

export function ListStageMenu({ id, stage, disabled, labels }: { id: string; stage: string; disabled?: boolean; labels: CrmDictionary }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(next: string) {
    if (busy || disabled || next === stage) return;
    setBusy(true); setError("");
    try { await crmRequest(`/api/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify({ action: "update", data: { stageId: next } }) }); invalidateCrm("deal"); }
    catch (reason) { setError(requestError(reason, labels)); }
    finally { setBusy(false); }
  }
  return <div><DropdownMenu><DropdownMenuTrigger asChild><Button size="xs" variant="outline" disabled={disabled || busy} aria-label={`${labels.labels.stageId}: ${labels.stages[stage as keyof CrmDictionary["stages"]] ?? stage}`}><span className={`size-1.5 rounded-full ${stage === "closed-won" ? "bg-primary" : stage === "closed-lost" ? "bg-destructive" : "bg-muted-foreground"}`} />{labels.stages[stage as keyof CrmDictionary["stages"]] ?? stage}<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={stage} onValueChange={value => void change(value)}>{DEAL_STAGE_IDS.map(value => <DropdownMenuRadioItem key={value} value={value} disabled={busy || disabled}>{labels.stages[value]}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>{error && <p role="alert" className="mt-1 max-w-48 text-xs text-destructive">{error}</p>}</div>;
}
