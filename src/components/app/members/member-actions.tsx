"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppDictionary } from "@/lib/i18n/dictionary";

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

  return <div className="flex items-center gap-2">
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={pending} aria-label={`${dictionary.members.actions}: ${member.name}`}><OverflowMenuHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      {member.status === "revoked" ? <DropdownMenuItem onSelect={() => void mutate("PATCH", { action: "restore" })}>{dictionary.members.restore}</DropdownMenuItem> : <><DropdownMenuItem onSelect={() => void mutate("PATCH", { action: "change-role", role: member.role === "owner" ? "member" : "owner" })}>{member.role === "owner" ? dictionary.members.makeMember : dictionary.members.makeOwner}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => { setMessage(null); setReplacement(""); setOpen(true); }}>{dictionary.members.remove}</DropdownMenuItem></>}
    </DropdownMenuContent></DropdownMenu>
    <Dialog onOpenChange={(value) => { setOpen(value); if (value) { setMessage(null); setReplacement(""); } }} open={open}>
      <DialogContent closeLabel={dictionary.common.close}>
        <DialogHeader><DialogTitle>{dictionary.members.removeTitle}</DialogTitle><DialogDescription>{dictionary.members.removeDescription}</DialogDescription></DialogHeader>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor={`replacement-${member.membershipId}`}>{dictionary.members.replacement}</label><select className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs" id={`replacement-${member.membershipId}`} onChange={(event) => setReplacement(event.target.value)} required value={replacement}><option disabled value="">—</option>{!selfRemoval ? <option value="__none">{dictionary.members.noReplacement}</option> : null}{candidates.map((candidate) => <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.name} ({candidate.email})</option>)}</select></div>
        {message ? <p aria-live="assertive" className="text-sm text-destructive" role="alert">{message}</p> : null}
        {selfRemovalBlocked ? <p className="text-sm text-destructive" role="alert">{dictionary.members.lastOwner}</p> : null}
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{dictionary.common.cancel}</Button></DialogClose><Button disabled={pending || !replacement || selfRemovalBlocked} onClick={() => mutate("DELETE", { replacementMembershipId: replacement === "__none" ? null : replacement })} type="button" variant="destructive">{pending ? dictionary.common.loading : dictionary.members.remove}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {message && !open ? <span aria-live="polite" className="text-xs">{message}</span> : null}
  </div>;
}
