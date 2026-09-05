import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { MembersTable } from "@/components/members/members-table";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { createCompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { requireRequestContext } from "@/server/request-context";

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const root = createCompositionRoot(env as RuntimeEnv);
  const context = await requireRequestContext(new Headers(await headers()), root);
  if (context.role !== "owner") notFound();
  const members = (await root.members.list(context)).map((member) => ({ ...member, createdAt: member.createdAt.toISOString() }));
  const dictionary = getDictionary(locale);
  return <div className="mx-auto max-w-6xl space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">{dictionary.members.title}</h1><p className="mt-1 text-sm text-muted-foreground">{dictionary.members.description}</p></div><MembersTable currentMembershipId={context.membershipId} dictionary={dictionary} members={members} /></div>;
}
