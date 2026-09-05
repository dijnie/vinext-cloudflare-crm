import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppDictionary } from "@/i18n/dictionary";

import { MemberActions, type MemberView } from "./member-actions";

export function MembersTable({ currentMembershipId, dictionary, members }: { currentMembershipId: string; dictionary: AppDictionary; members: MemberView[] }) {
  return <div className="overflow-hidden rounded-lg border bg-background"><Table><TableHeader><TableRow><TableHead>{dictionary.members.member}</TableHead><TableHead>{dictionary.members.role}</TableHead><TableHead>{dictionary.members.status}</TableHead><TableHead>{dictionary.members.actions}</TableHead></TableRow></TableHeader><TableBody>{members.map((member) => <TableRow key={member.membershipId}><TableCell><div className="font-medium">{member.name}</div><div className="text-xs text-muted-foreground">{member.email}</div></TableCell><TableCell><Badge variant={member.role === "owner" ? "default" : "secondary"}>{member.role === "owner" ? dictionary.members.owner : dictionary.members.member}</Badge></TableCell><TableCell><Badge variant="outline">{member.status === "active" ? dictionary.members.active : dictionary.members.revoked}</Badge></TableCell><TableCell><MemberActions currentMembershipId={currentMembershipId} dictionary={dictionary} member={member} members={members} /></TableCell></TableRow>)}</TableBody></Table></div>;
}
