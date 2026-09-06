"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { FormSelect } from "./record-sheet/form-select";
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
    <FormSelect id={id} required={required} disabled={disabled} value={value?.membershipId ?? ""} onValueChange={next => onChange(owners.find(owner => owner.membershipId === next) ?? (retained?.membershipId === next ? retained : null))} busy={status === "loading"} describedBy={status === "error" ? `${id}-error` : undefined} options={[
      { value: "", label: required ? labels.chooseOwner : labels.none, disabled: required },
      ...(retained ? [{ value: retained.membershipId, label: `${retained.name || retained.email || retained.membershipId}${status === "ready" ? ` · ${labels.activity.unavailableOwner}` : ""}`, disabled: status === "ready" }] : []),
      ...owners.map(owner => ({ value: owner.membershipId, label: owner.name || owner.email || owner.membershipId })),
    ]} />
    {status === "error" && <div id={`${id}-error`} role="alert" className="text-sm text-destructive">{labels.error}<Button type="button" variant="ghost" onClick={() => setRevision(v => v + 1)}>{labels.retry}</Button></div>}
  </div>;
}
