import { notFound } from "next/navigation";
import { asc, isNull, sql } from "drizzle-orm";
import { ReviewBoard } from "@/components/app/b2b/review-board";
import { getPageContext } from "@/lib/http/page-context";
import { isAppLocale } from "@/lib/i18n/config";
import { company, contact } from "@/lib/db/schema";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const [initialData, companies, contacts] = await Promise.all([
    root.reviews.list(context),
    root.db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(isNull(company.archivedAt))
      .orderBy(asc(company.name)),
    root.db
      .select({
        id: contact.id,
        name: sql<string>`trim(${contact.firstName} || ' ' || coalesce(${contact.lastName},''))`,
      })
      .from(contact)
      .where(isNull(contact.archivedAt))
      .orderBy(asc(contact.firstName)),
  ]);
  return (
    <ReviewBoard
      locale={locale}
      initialData={initialData}
      companies={companies}
      contacts={contacts}
    />
  );
}
