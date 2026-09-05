import { inJsonArray } from "@/modules/crm/sql-filters";
import { fieldFilterConditions, fieldListData, validateFieldFilters } from "@/modules/fields/field-list-query";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { listFacets } from "@/modules/crm/facet-repository";
import { company, contact, deal, singletonMembership, user } from "@/db/schema";
import type {
  CompanyListInput,
  CompanyUpdateData,
} from "@/modules/crm/contracts/company-contract";

export class CompanyRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(input: CompanyListInput) {
    await validateFieldFilters(this.db, "company", input.fields);
    const where = this.where(input);
    const order = this.order(input.sort, input.dir);
    const rowsQuery = this.db
      .select({
        id: company.id,
        name: company.name,
        domain: company.domain,
        website: company.website,
        industry: company.industry,
        ownerMembershipId: company.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        lastActivityAt: company.lastActivityAt,
        archivedAt: company.archivedAt,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        contactCount: sql<number>`(SELECT count(*) FROM contact WHERE contact.company_id = ${company.id})`,
        openDealCount: sql<number>`(SELECT count(*) FROM deal INNER JOIN deal_stage ON deal_stage.id = deal.stage_id WHERE deal.company_id = ${company.id} AND deal.archived_at IS NULL AND deal_stage.closed_state = 'open')`,
      })
      .from(company)
      .leftJoin(user, eq(user.id, company.ownerMembershipId))
      .where(where)
      .orderBy(order, asc(company.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const countQuery = this.db
      .select({ total: sql<number>`count(*)` })
      .from(company)
      .where(where);
    const facetWhere = this.where({ ...input, owner: [], industry: [], fields: {} });
    const [rows, [{ total }], facets] = await Promise.all([
      rowsQuery,
      countQuery,
      listFacets(this.db, "company", facetWhere),
    ]);
    const fields = await fieldListData(this.db, "company", rows.map(row => row.id), facetWhere);
    return { rows: rows.map(row => ({ ...row, fields: fields.fieldsByRecord[row.id] ?? {} })), total, facets, customFields: fields.customFields, fieldFacets: fields.fieldFacets, fieldUserLabels: fields.fieldUserLabels };
  }

  async byId(id: string) {
    const record = await this.db
      .select({
        id: company.id,
        name: company.name,
        domain: company.domain,
        website: company.website,
        description: company.description,
        industry: company.industry,
        city: company.city,
        countryCode: company.countryCode,
        phone: company.phone,
        email: company.email,
        ownerMembershipId: company.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        lastActivityAt: company.lastActivityAt,
        archivedAt: company.archivedAt,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      })
      .from(company)
      .leftJoin(user, eq(user.id, company.ownerMembershipId))
      .where(eq(company.id, id))
      .get();
    if (!record) return null;
    const contacts = await this.db
      .select({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        title: contact.title,
      })
      .from(contact)
      .where(eq(contact.companyId, id))
      .orderBy(asc(contact.lastName), asc(contact.firstName), asc(contact.id));
    const deals = await this.db
      .select({
        id: deal.id,
        name: deal.name,
        stageId: deal.stageId,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        ownerMembershipId: deal.ownerMembershipId,
        archivedAt: deal.archivedAt,
      })
      .from(deal)
      .where(eq(deal.companyId, id))
      .orderBy(asc(deal.name), asc(deal.id));
    return { ...record, contacts, deals };
  }

  create(values: typeof company.$inferInsert) {
    return this.db.insert(company).values(values).returning().get();
  }
  update(id: string, values: Partial<typeof company.$inferInsert>) {
    return this.db
      .update(company)
      .set(values)
      .where(eq(company.id, id))
      .returning()
      .get();
  }
  archive(id: string, archivedAt: Date | null) {
    return this.db
      .update(company)
      .set({ archivedAt, updatedAt: new Date() })
      .where(eq(company.id, id))
      .returning()
      .get();
  }
  async bulkArchive(ids: string[], archivedAt: Date | null) {
    const result = await this.db
      .update(company)
      .set({ archivedAt, updatedAt: new Date() })
      .where(inJsonArray(company.id, ids));
    return result.meta.changes;
  }
  activeMember(id: string) {
    return this.db.query.singletonMembership.findFirst({
      where: and(
        eq(singletonMembership.userId, id),
        eq(singletonMembership.status, "active"),
      ),
    });
  }

  private where(input: CompanyListInput): SQL<unknown> {
    const conditions: SQL<unknown>[] = [
      ...fieldFilterConditions("company", input.fields),
      input.archived
        ? isNotNull(company.archivedAt)
        : isNull(company.archivedAt),
    ];
    if (input.q)
      conditions.push(
        or(
          like(company.name, `%${input.q}%`),
          like(company.domain, `%${input.q}%`),
          like(company.email, `%${input.q}%`),
        )!,
      );
    if (input.industry.length)
      conditions.push(inJsonArray(company.industry, input.industry));
    if (input.owner.length) {
      const assigned = input.owner.filter((id) => id !== "unassigned");
      conditions.push(
        input.owner.includes("unassigned")
          ? assigned.length
            ? or(
                inJsonArray(company.ownerMembershipId, assigned),
                isNull(company.ownerMembershipId),
              )!
            : isNull(company.ownerMembershipId)
          : inJsonArray(company.ownerMembershipId, assigned),
      );
    }
    return and(...conditions)!;
  }

  private order(sort: CompanyListInput["sort"], dir: CompanyListInput["dir"]) {
    const column =
      sort === "name"
        ? company.name
        : sort === "domain"
          ? company.domain
          : sort === "industry"
            ? company.industry
            : sort === "lastActivityAt"
              ? company.lastActivityAt
              : sort === "archivedAt"
                ? company.archivedAt
                : company.createdAt;
    return dir === "desc" ? desc(column) : asc(column);
  }
}
