import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";

import { CompanyList } from "@/components/compat/company-list";
import { company } from "@/db/schema";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { createCompositionRoot, type RuntimeEnv } from "@/server/composition-root";

export default async function CompaniesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const root = createCompositionRoot(env as RuntimeEnv);
  const companies = await root.db.select({ id: company.id, name: company.name }).from(company).limit(100);
  const dictionary = getDictionary(locale);
  return <div className="mx-auto max-w-6xl space-y-6"><h1 className="text-2xl font-semibold tracking-tight">{dictionary.companies.title}</h1><CompanyList companies={companies} labels={dictionary.companies} /></div>;
}
