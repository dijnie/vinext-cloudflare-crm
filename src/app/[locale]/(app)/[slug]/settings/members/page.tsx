import { notFound } from "next/navigation";

import { MembersTable } from "@/components/app/members/members-table";
import { isAppLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getPageContext } from "@/lib/http/page-context";

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  if (context.role !== "owner") notFound();
  const members = (await root.members.list(context)).map((member) => ({ ...member, createdAt: member.createdAt.toISOString() }));
  const dictionary = getDictionary(locale);
  return <div className="mx-auto max-w-6xl space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">{dictionary.members.title}</h1><p className="mt-1 text-sm text-muted-foreground">{dictionary.members.description}</p></div><MembersTable currentMembershipId={context.membershipId} dictionary={dictionary} members={members} /></div>;
}
