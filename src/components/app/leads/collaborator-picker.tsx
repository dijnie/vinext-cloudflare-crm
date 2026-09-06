"use client";
import { useState } from "react";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { OwnerPicker, type OwnerOption } from "../owner-picker";
import { Button } from "@/components/ui/button";
export function CollaboratorPicker({ value, onChange, labels, disabled }: { value: OwnerOption[]; onChange: (value: OwnerOption[]) => void; labels: CrmDictionary; disabled: boolean }) {
  const [next, setNext] = useState<OwnerOption | null>(null);
  return <div className="space-y-2"><ul className="space-y-1">{value.map(owner => <li key={owner.membershipId} className="flex items-center gap-2"><span className="min-w-0 flex-1 break-words text-sm">{owner.name || owner.email || owner.membershipId}</span><Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`${labels.clear}: ${owner.name || owner.email}`} onClick={() => onChange(value.filter(item => item.membershipId !== owner.membershipId))}>{labels.clear}</Button></li>)}</ul><OwnerPicker id="record-collaboratorMembershipIds" name="" value={next} labels={labels} disabled={disabled} onChange={owner => { setNext(null); if (owner && !value.some(item => item.membershipId === owner.membershipId)) onChange([...value, owner]); }} /></div>;
}
