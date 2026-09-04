import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireSingletonMembership } from "@/auth/require-singleton-membership";
import { CompanyList } from "@/components/compat/company-list";
import { company } from "@/db/schema";
import { getDictionary, isAppLocale } from "@/i18n/get-dictionary";
import {
  createCompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";

export default async function CompaniesPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isAppLocale(locale) || slug !== "crm") notFound();

  const root = createCompositionRoot(env as RuntimeEnv);
  const membership = await requireSingletonMembership(
    new Headers(await headers()),
    root,
  );
  if (!membership) redirect(`/${locale}/sign-in`);

  const companies = await root.db.select().from(company).limit(100);
  const dictionary = getDictionary(locale);
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <h1 className="text-3xl font-bold">{dictionary.title}</h1>
      <CompanyList companies={companies} labels={dictionary} />
    </main>
  );
}
