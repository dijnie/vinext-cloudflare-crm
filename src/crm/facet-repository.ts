import { asc, eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { company, contact, deal, dealStage, user } from "@/db/schema";
import type { EntityType } from "./list-state";

export async function listFacets(db: AppDatabase, entity: EntityType, where: SQL) {
  const table = entity === "company" ? company : entity === "contact" ? contact : deal;
  const owner = await db.select({ value: sql<string>`coalesce(${table.ownerMembershipId}, 'unassigned')`, label: sql<string>`coalesce(${user.name}, '')`, count: sql<number>`count(*)` }).from(table).leftJoin(user, eq(user.id, table.ownerMembershipId)).where(where).groupBy(table.ownerMembershipId, user.name).orderBy(asc(user.name)).limit(100);
  const facets: Record<string, {value: string; label: string; count: number}[]> = { owner };
  if (entity === "company") {
    facets.industry = await db.select({ value: sql<string>`coalesce(${company.industry}, '')`, label: sql<string>`coalesce(${company.industry}, '')`, count: sql<number>`count(*)` }).from(company).where(where).groupBy(company.industry).orderBy(asc(company.industry)).limit(100);
  } else {
    const related = entity === "contact" ? contact : deal;
    facets.company = await db.select({ value: sql<string>`coalesce(${related.companyId}, '')`, label: sql<string>`coalesce(${company.name}, '')`, count: sql<number>`count(*)` }).from(related).leftJoin(company, eq(company.id, related.companyId)).where(where).groupBy(related.companyId, company.name).orderBy(asc(company.name)).limit(100);
    if (entity === "contact") facets.title = await db.select({ value: sql<string>`coalesce(${contact.title}, '')`, label: sql<string>`coalesce(${contact.title}, '')`, count: sql<number>`count(*)` }).from(contact).where(where).groupBy(contact.title).orderBy(asc(contact.title)).limit(100);
    else facets.stage = await db.select({ value: deal.stageId, label: dealStage.labelKey, count: sql<number>`count(*)` }).from(deal).innerJoin(dealStage, eq(dealStage.id, deal.stageId)).where(where).groupBy(deal.stageId, dealStage.labelKey, dealStage.position).orderBy(asc(dealStage.position));
  }
  for (const key of Object.keys(facets)) facets[key] = facets[key].filter(option => option.value !== "");
  return facets;
}
