"use client";
import { useDealStages } from "./deal-stage-provider";
import { useState } from "react";
import { ChevronDown } from "@carbon/icons-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { invalidateCrm } from "@/lib/listing/invalidation";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { crmRequest, requestError } from "./record-types";

export function ListStageMenu({ id, stage, disabled, labels }: { id: string; stage: string; disabled?: boolean; labels: CrmDictionary }) {
  const stageCatalog = useDealStages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(next: string) {
    if (stageCatalog.unavailable || busy || disabled || next === stage) return;
    setBusy(true); setError("");
    try { await crmRequest(`/api/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify({ action: "update", data: { stageId: next } }) }); invalidateCrm("deal"); }
    catch (reason) { setError(requestError(reason, labels)); }
    finally { setBusy(false); }
  }
  return <div><DropdownMenu><DropdownMenuTrigger asChild><Button size="xs" variant="outline" disabled={disabled || busy || stageCatalog.unavailable} aria-label={`${labels.labels.stageId}: ${stageCatalog.label(stage)}`}><span className={`size-1.5 rounded-full ${stageCatalog.all.find(item => item.id === stage)?.closedState === "won" ? "bg-primary" : stageCatalog.all.find(item => item.id === stage)?.closedState === "lost" ? "bg-destructive" : "bg-muted-foreground"}`} />{stageCatalog.label(stage)}<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={stage} onValueChange={value => void change(value)}>{stageCatalog.options(stage).map(option => <DropdownMenuRadioItem key={option.value} value={option.value} disabled={busy || disabled || option.disabled}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>{error && <p role="alert" className="mt-1 max-w-48 text-xs text-destructive">{error}</p>}</div>;
}
