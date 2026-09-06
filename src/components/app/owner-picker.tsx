"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { selectClass } from "./list-toolbar";
import { crmRequest } from "./record-types";

export interface OwnerOption { membershipId: string; name: string | null; email: string | null }
export function OwnerPicker({ id, name = "ownerMembershipId", value, onChange, labels, required = false, disabled = false }: { id: string; name?: string; value: OwnerOption | null; onChange: (owner: OwnerOption | null) => void; labels: CrmDictionary; required?: boolean; disabled?: boolean }) {
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setStatus("loading");
    crmRequest<{ rows: OwnerOption[] }>("/api/crm/owners", { signal: controller.signal }).then(result => { setOwners(result.rows); setStatus("ready"); }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [revision]);
  const retained = value && !owners.some(owner => owner.membershipId === value.membershipId) ? value : null;
  return <div className="space-y-1">
    <input type="hidden" name={name} value={value?.membershipId ?? ""} />
    <select id={id} className={`${selectClass} w-full`} required={required} disabled={disabled} value={value?.membershipId ?? ""} onChange={event => onChange(owners.find(owner => owner.membershipId === event.target.value) ?? null)} aria-busy={status === "loading"} aria-describedby={status === "error" ? `${id}-error` : undefined}>
      <option value="" disabled={required}>{required ? labels.chooseOwner : labels.none}</option>
      {retained && <option value={retained.membershipId} disabled={status === "ready"}>{retained.name || retained.email || retained.membershipId}{status === "ready" ? ` · ${labels.activity.unavailableOwner}` : ""}</option>}
      {owners.map(owner => <option key={owner.membershipId} value={owner.membershipId}>{owner.name || owner.email || owner.membershipId}</option>)}
    </select>
    {status === "error" && <div id={`${id}-error`} role="alert" className="text-sm text-destructive">{labels.error}<Button type="button" variant="ghost" onClick={() => setRevision(v => v + 1)}>{labels.retry}</Button></div>}
  </div>;
}
