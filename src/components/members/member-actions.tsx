"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AppDictionary } from "@/i18n/dictionary";

export interface MemberView {
  membershipId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  status: "active" | "revoked";
  createdAt: string;
}

export function MemberActions({ currentMembershipId, dictionary, member, members }: { currentMembershipId: string; dictionary: AppDictionary; member: MemberView; members: MemberView[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [replacement, setReplacement] = useState("");
  const selfRemoval = currentMembershipId === member.membershipId;
  const candidates = members.filter((candidate) => candidate.status === "active" && candidate.membershipId !== member.membershipId);
  const isLastOwner = member.role === "owner" && members.filter((candidate) => candidate.status === "active" && candidate.role === "owner").length === 1;
  const selfRemovalBlocked = selfRemoval && isLastOwner;

  async function mutate(method: "PATCH" | "DELETE", body: object) {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/crm/members/${encodeURIComponent(member.membershipId)}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
      setMessage(payload?.error?.code === "conflict" && isLastOwner ? dictionary.members.lastOwner : dictionary.members.genericError);
      setPending(false);
      return;
    }
    setMessage(dictionary.members.saved);
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  if (member.status === "revoked") return <div><Button disabled={pending} onClick={() => mutate("PATCH", { action: "restore" })} size="sm" type="button" variant="outline">{pending ? dictionary.common.loading : dictionary.members.restore}</Button>{message ? <p aria-live="polite" className="mt-2 text-xs">{message}</p> : null}</div>;

  return <div className="flex min-w-max items-center gap-2">
    <Button disabled={pending} onClick={() => mutate("PATCH", { action: "change-role", role: member.role === "owner" ? "member" : "owner" })} size="sm" type="button" variant="outline">{member.role === "owner" ? dictionary.members.makeMember : dictionary.members.makeOwner}</Button>
    <Dialog onOpenChange={(value) => { setOpen(value); if (value) { setMessage(null); setReplacement(""); } }} open={open}>
      <DialogTrigger asChild><Button disabled={pending} size="sm" type="button" variant="destructive">{dictionary.members.remove}</Button></DialogTrigger>
      <DialogContent closeLabel={dictionary.common.close}>
        <DialogHeader><DialogTitle>{dictionary.members.removeTitle}</DialogTitle><DialogDescription>{dictionary.members.removeDescription}</DialogDescription></DialogHeader>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`replacement-${member.membershipId}`}>{dictionary.members.replacement}</label><select className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id={`replacement-${member.membershipId}`} onChange={(event) => setReplacement(event.target.value)} required value={replacement}><option disabled value="">—</option>{!selfRemoval ? <option value="__none">{dictionary.members.noReplacement}</option> : null}{candidates.map((candidate) => <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.name} ({candidate.email})</option>)}</select></div>
        {message ? <p aria-live="assertive" className="text-sm text-destructive" role="alert">{message}</p> : null}
        {selfRemovalBlocked ? <p className="text-sm text-destructive" role="alert">{dictionary.members.lastOwner}</p> : null}
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{dictionary.common.cancel}</Button></DialogClose><Button disabled={pending || !replacement || selfRemovalBlocked} onClick={() => mutate("DELETE", { replacementMembershipId: replacement === "__none" ? null : replacement })} type="button" variant="destructive">{pending ? dictionary.common.loading : dictionary.members.remove}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {message && !open ? <span aria-live="polite" className="text-xs">{message}</span> : null}
  </div>;
}
