import type { PreparedRecordFields, PreparedRecordCreation } from "../shared/record-fields-contract";
import { lead, leadConversion, dealStage, operationConditionGuard } from "@/lib/db/schema";
import { assertQueryLimits } from "@/lib/db/query-limits";
import { fieldConditionQuery } from "../custom-fields/field-condition-query";
import { customFieldSort } from "../custom-fields/field-sort";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, authorizedWrite, permissionError } from "../permissions/permission-policy";
import { inJsonArray } from "@/lib/db/sql-filters";
import { fieldFilterConditions, fieldListData, validateFieldFilters } from "@/lib/services/custom-fields/field-list-query";
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

import type { AppDatabase } from "@/lib/db/database";
import { listFacets } from "@/lib/services/shared/facet-repository";
import {
  company,
  contact,
  deal,
  dealContact,
  singletonMembership,
  user,
} from "@/lib/db/schema";
import type { ContactListInput } from "@/lib/services/contacts/contact-contract";

export class ContactRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(input: ContactListInput) {
    await validateFieldFilters(this.db, "contact", input.fields);
    const fieldSort = await customFieldSort(this.db, "contact", input.sort, input.dir);
    const conditions = await fieldConditionQuery(this.db, "contact", input.criteria);
    const where = and(this.where(input), ...conditions)!;
    const rowsQuery = this.db
      .select({
        internalFieldSortValue: fieldSort?.value ?? sql`null`,
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
      .orderBy(...(fieldSort?.order ?? [this.order(input.sort, input.dir)]), asc(contact.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const countQuery = this.db
      .select({ total: sql<number>`count(*)` })
      .from(contact)
      .where(where);
    const facetWhere = and(this.where({ ...input, owner: [], company: [], title: [], fields: {} }), ...conditions)!;
    assertQueryLimits(rowsQuery, countQuery);
    const [rows, [{ total }], facets] = await Promise.all([
      rowsQuery,
      countQuery,
      listFacets(this.db, "contact", facetWhere),
    ]);
    const fields = await fieldListData(this.db, "contact", rows.map(row => row.id), facetWhere);
    return { rows: rows.map(({ internalFieldSortValue: _sortValue, ...row }) => ({ ...row, fields: fields.fieldsByRecord[row.id] ?? {} })), total, facets, customFields: fields.customFields, fieldFacets: fields.fieldFacets, fieldFileLabels: fields.fieldFileLabels, fieldCustomerLabels: fields.fieldCustomerLabels, fieldUserLabels: fields.fieldUserLabels };
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
        stageLabel: dealStage.label,
        stageLabelKey: dealStage.labelKey,
        closedState: dealStage.closedState,
        role: dealContact.role,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        archivedAt: deal.archivedAt,
      })
      .from(dealContact)
      .innerJoin(deal, eq(deal.id, dealContact.dealId))
      .innerJoin(dealStage, eq(dealStage.id, deal.stageId))
      .where(eq(dealContact.contactId, id))
      .orderBy(asc(deal.name), asc(deal.id));
    const convertedFrom = await this.db.select({ id: lead.id, firstName: lead.firstName, lastName: lead.lastName, convertedAt: leadConversion.completedAt })
      .from(leadConversion).innerJoin(lead, eq(lead.id, leadConversion.leadId))
      .where(eq(leadConversion.contactId, id)).orderBy(desc(leadConversion.completedAt), asc(leadConversion.leadId)).limit(100);
    return { ...record, deals, convertedFrom };
  }

  prepareCreate(values: typeof contact.$inferInsert, context: RequestContext, fields?: PreparedRecordFields, creation?: PreparedRecordCreation) {
    const op = actionGuard(this.db, context, ["contact.create", ...(values.ownerMembershipId ? ["contact.assign" as const] : [])]);
    const before = creation?.before ?? [];
    const statements: Parameters<AppDatabase["batch"]>[0] = [op.begin, ...before, this.db.insert(contact).values(values).returning(), ...(fields?.statements ?? []), ...(creation?.after ?? []), op.end];
    return {
      statements,
      resultIndex: 1 + before.length,
      translateError(error: unknown): never { if (fields) fields.translateError(error); permissionError(error); },
    };
  }
  async create(values: typeof contact.$inferInsert, context: RequestContext, fields?: PreparedRecordFields, creation?: PreparedRecordCreation) {
    const prepared = this.prepareCreate(values, context, fields, creation);
    try {
      const results = await this.db.batch(prepared.statements);
      return (results[prepared.resultIndex] as (typeof contact.$inferSelect)[])[0]!;
    } catch (error) { return prepared.translateError(error); }
  }
  async update(id: string, values: Partial<typeof contact.$inferInsert>, context: RequestContext, fields?: PreparedRecordFields) {
    const op = actionGuard(this.db, context, ["contact.update", ...(values.ownerMembershipId !== undefined ? ["contact.assign" as const] : [])]);
    const guardId = crypto.randomUUID();
    try {
      const results = await this.db.batch([op.begin, this.db.update(contact).set(values).where(eq(contact.id, id)).returning(),
        ...(fields ? [this.db.insert(operationConditionGuard).values({ id: guardId, authorized: sql<number>`case when changes()=1 then 1 else 0 end` }), ...fields.statements, this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, guardId))] : []), op.end]);
      return (results[1] as (typeof contact.$inferSelect)[])[0]!;
    } catch (error) { if (fields) fields.translateError(error); permissionError(error); }
  }
  async archive(id: string, archivedAt: Date | null, context: RequestContext) {
    const rows = await authorizedWrite(this.db, context, [archivedAt ? "contact.archive" : "contact.restore"], this.db.update(contact).set({ archivedAt, updatedAt: new Date() }).where(eq(contact.id, id)).returning());
    return rows[0];
  }
  async bulkArchive(ids: string[], archivedAt: Date | null, context: RequestContext) {
    const result = await authorizedWrite(this.db, context, [archivedAt ? "contact.archive" : "contact.restore"], this.db.update(contact).set({ archivedAt, updatedAt: new Date() }).where(inJsonArray(contact.id, ids)));
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
