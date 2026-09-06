import { notFound } from "next/navigation";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { ContractBoard } from "@/components/app/b2b/contract-board";
import { getPageContext } from "@/lib/http/page-context";
import { isAppLocale } from "@/lib/i18n/config";
import {
  company,
  contact,
  deal,
  salesOrder,
  singletonMembership,
  user,
} from "@/lib/db/schema";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const [initialData, companies, contacts, deals, orders, owners] =
    await Promise.all([
      root.contracts.list(context, {
        status: "all",
        archived: false,
        limit: 100,
      }),
      root.db
        .select({ id: company.id, name: company.name })
        .from(company)
        .where(isNull(company.archivedAt))
        .orderBy(asc(company.name)),
      root.db
        .select({
          id: contact.id,
          name: sql<string>`trim(${contact.firstName} || ' ' || coalesce(${contact.lastName},''))`,
          companyId: contact.companyId,
        })
        .from(contact)
        .where(isNull(contact.archivedAt))
        .orderBy(asc(contact.firstName)),
      root.db
        .select({ id: deal.id, name: deal.name, companyId: deal.companyId })
        .from(deal)
        .where(isNull(deal.archivedAt))
        .orderBy(asc(deal.name)),
      root.db
        .select({
          id: salesOrder.id,
          name: salesOrder.name,
          companyId: salesOrder.companyId,
        })
        .from(salesOrder)
        .where(isNull(salesOrder.archivedAt))
        .orderBy(asc(salesOrder.name)),
      root.db
        .select({ id: user.id, name: user.name })
        .from(singletonMembership)
        .innerJoin(user, eq(user.id, singletonMembership.userId))
        .where(eq(singletonMembership.status, "active"))
        .orderBy(asc(user.name)),
    ]);
  return (
    <ContractBoard
      locale={locale}
      initialData={initialData}
      companies={companies}
      contacts={contacts}
      deals={deals}
      orders={orders}
      owners={owners}
    />
  );
}
