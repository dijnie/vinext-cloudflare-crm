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
import {
  company,
  contact,
  deal,
  dealContact,
  singletonMembership,
  user,
} from "@/db/schema";
import type { ContactListInput } from "@/modules/crm/contracts/contact-contract";

export class ContactRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(input: ContactListInput) {
    await validateFieldFilters(this.db, "contact", input.fields);
    const where = this.where(input);
    const rows = await this.db
      .select({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        title: contact.title,
        companyId: contact.companyId,
        companyName: company.name,
        companyDomain: company.domain,
        ownerMembershipId: contact.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        lastActivityAt: contact.lastActivityAt,
        archivedAt: contact.archivedAt,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      })
      .from(contact)
      .leftJoin(company, eq(company.id, contact.companyId))
      .leftJoin(user, eq(user.id, contact.ownerMembershipId))
      .where(where)
      .orderBy(this.order(input.sort, input.dir), asc(contact.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(contact)
      .where(where);
    const facetWhere = this.where({ ...input, owner: [], company: [], title: [], fields: {} });
    const facets = await listFacets(this.db, "contact", facetWhere);
    const fields = await fieldListData(this.db, "contact", rows.map(row => row.id), facetWhere);
    return { rows: rows.map(row => ({ ...row, fields: fields.fieldsByRecord[row.id] ?? {} })), total, facets, customFields: fields.customFields, fieldFacets: fields.fieldFacets, fieldUserLabels: fields.fieldUserLabels };
  }

  async byId(id: string) {
    const record = await this.db
      .select({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        title: contact.title,
        companyId: contact.companyId,
        companyName: company.name,
        companyDomain: company.domain,
        ownerMembershipId: contact.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        lastActivityAt: contact.lastActivityAt,
        archivedAt: contact.archivedAt,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      })
      .from(contact)
      .leftJoin(company, eq(company.id, contact.companyId))
      .leftJoin(user, eq(user.id, contact.ownerMembershipId))
      .where(eq(contact.id, id))
      .get();
    if (!record) return null;
    const deals = await this.db
      .select({
        id: deal.id,
        name: deal.name,
        stageId: deal.stageId,
        role: dealContact.role,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        archivedAt: deal.archivedAt,
      })
      .from(dealContact)
      .innerJoin(deal, eq(deal.id, dealContact.dealId))
      .where(eq(dealContact.contactId, id))
      .orderBy(asc(deal.name), asc(deal.id));
    return { ...record, deals };
  }

  create(values: typeof contact.$inferInsert) {
    return this.db.insert(contact).values(values).returning().get();
  }
  update(id: string, values: Partial<typeof contact.$inferInsert>) {
    return this.db
      .update(contact)
      .set(values)
      .where(eq(contact.id, id))
      .returning()
      .get();
  }
  archive(id: string, archivedAt: Date | null) {
    return this.db
      .update(contact)
      .set({ archivedAt, updatedAt: new Date() })
      .where(eq(contact.id, id))
      .returning()
      .get();
  }
  async bulkArchive(ids: string[], archivedAt: Date | null) {
    const result = await this.db
      .update(contact)
      .set({ archivedAt, updatedAt: new Date() })
      .where(inJsonArray(contact.id, ids));
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
  company(id: string) {
    return this.db.query.company.findFirst({ where: eq(company.id, id) });
  }
  async hasIncompatibleDeal(contactId: string, companyId: string | null) {
    const row = await this.db
      .select({ id: deal.id })
      .from(dealContact)
      .innerJoin(deal, eq(deal.id, dealContact.dealId))
      .where(
        and(
          eq(dealContact.contactId, contactId),
          companyId ? sql`${deal.companyId} != ${companyId}` : sql`1 = 1`,
        ),
      )
      .limit(1);
    return row.length > 0;
  }

  private where(input: ContactListInput): SQL<unknown> {
    const conditions: SQL<unknown>[] = [
      ...fieldFilterConditions("contact", input.fields),
      input.archived
        ? isNotNull(contact.archivedAt)
        : isNull(contact.archivedAt),
    ];
    if (input.q)
      conditions.push(
        or(
          like(contact.firstName, `%${input.q}%`),
          like(contact.lastName, `%${input.q}%`),
          like(contact.email, `%${input.q}%`),
          like(contact.title, `%${input.q}%`),
        )!,
      );
    if (input.title.length)
      conditions.push(inJsonArray(contact.title, input.title));
    if (input.company.length)
      conditions.push(inJsonArray(contact.companyId, input.company));
    if (input.owner.length) {
      const assigned = input.owner.filter((id) => id !== "unassigned");
      conditions.push(
        input.owner.includes("unassigned")
          ? assigned.length
            ? or(
                inJsonArray(contact.ownerMembershipId, assigned),
                isNull(contact.ownerMembershipId),
              )!
            : isNull(contact.ownerMembershipId)
          : inJsonArray(contact.ownerMembershipId, assigned),
      );
    }
    return and(...conditions)!;
  }

  private order(sort: ContactListInput["sort"], dir: ContactListInput["dir"]) {
    const column =
      sort === "firstName"
        ? contact.firstName
        : sort === "lastName"
          ? contact.lastName
          : sort === "email"
            ? contact.email
            : sort === "title"
              ? contact.title
              : sort === "lastActivityAt"
                ? contact.lastActivityAt
                : sort === "archivedAt"
                  ? contact.archivedAt
                  : contact.createdAt;
    return dir === "desc" ? desc(column) : asc(column);
  }
}
