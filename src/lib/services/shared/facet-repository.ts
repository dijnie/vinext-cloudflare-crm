import { assertQueryLimits } from "@/lib/db/query-limits";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { company, contact, deal, dealStage, user } from "@/lib/db/schema";
import type { EntityType } from "../../listing/list-state";

export async function listFacets(db: AppDatabase, entity: Exclude<EntityType, "lead" | "product">, where: SQL) {
  // Keep positional select results: D1 batch collapses duplicate SQL column names.
  const table = entity === "company" ? company : entity === "contact" ? contact : deal;
  const ownerQuery = db.select({ value: sql<string>`coalesce(${table.ownerMembershipId}, 'unassigned')`, label: sql<string>`coalesce(${user.name}, '')`, count: sql<number>`count(*)` }).from(table).leftJoin(user, eq(user.id, table.ownerMembershipId)).where(where).groupBy(table.ownerMembershipId, user.name).orderBy(asc(user.name)).limit(100);
  const facets: Record<string, {value: string; label: string; count: number}[]> = {};
  if (entity === "company") {
    const industryQuery = db.select({ value: sql<string>`coalesce(${company.industry}, '')`, label: sql<string>`coalesce(${company.industry}, '')`, count: sql<number>`count(*)` }).from(company).where(where).groupBy(company.industry).orderBy(asc(company.industry)).limit(100);
    assertQueryLimits(ownerQuery, industryQuery);
    [facets.owner, facets.industry] = await Promise.all([ownerQuery, industryQuery]);
  } else {
    const related = entity === "contact" ? contact : deal;
    const companyQuery = db.select({ value: sql<string>`coalesce(${related.companyId}, '')`, label: sql<string>`coalesce(${company.name}, '')`, count: sql<number>`count(*)` }).from(related).leftJoin(company, eq(company.id, related.companyId)).where(where).groupBy(related.companyId, company.name).orderBy(asc(company.name)).limit(100);
    if (entity === "contact") {
      const titleQuery = db.select({ value: sql<string>`coalesce(${contact.title}, '')`, label: sql<string>`coalesce(${contact.title}, '')`, count: sql<number>`count(*)` }).from(contact).where(where).groupBy(contact.title).orderBy(asc(contact.title)).limit(100);
      assertQueryLimits(ownerQuery, companyQuery, titleQuery);
      [facets.owner, facets.company, facets.title] = await Promise.all([ownerQuery, companyQuery, titleQuery]);
    } else {
      const stageQuery = db.select({ value: deal.stageId, label: sql<string>`coalesce(${dealStage.label}, ${dealStage.labelKey})`, count: sql<number>`count(*)` }).from(deal).innerJoin(dealStage, eq(dealStage.id, deal.stageId)).where(where).groupBy(deal.stageId, dealStage.label, dealStage.labelKey, dealStage.position).orderBy(asc(dealStage.position));
      assertQueryLimits(ownerQuery, companyQuery, stageQuery);
      [facets.owner, facets.company, facets.stage] = await Promise.all([ownerQuery, companyQuery, stageQuery]);
    }
  }
  for (const key of Object.keys(facets)) facets[key] = facets[key].filter(option => option.value !== "");
  return facets;
}
