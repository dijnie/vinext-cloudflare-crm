import type { PreparedRecordFields, PreparedRecordCreation } from "../shared/record-fields-contract";
import { operationConditionGuard } from "@/lib/db/schema";
import { assertQueryLimits } from "@/lib/db/query-limits";
import { fieldConditionQuery } from "../custom-fields/field-condition-query";
import { customFieldSort } from "../custom-fields/field-sort";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, authorizedWrite } from "../permissions/permission-policy";
import { inJsonArray } from "@/lib/db/sql-filters";
import { fieldFilterConditions, fieldListData, validateFieldFilters } from "@/lib/services/custom-fields/field-list-query";
import {
  getTableColumns,
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
import {
  company,
  lead, leadSource, leadStatus, leadCollaborator,
  singletonMembership,
  user,
} from "@/lib/db/schema";
import type { LeadListInput } from "@/lib/services/leads/lead-contract";

export class LeadRepository {
  constructor(private readonly db: AppDatabase) { }

  async list(input: LeadListInput) {
    await validateFieldFilters(this.db, "lead", input.fields);
    const fieldSort = await customFieldSort(this.db, "lead", input.sort, input.dir);
    const conditions = await fieldConditionQuery(this.db, "lead", input.criteria);
    const where = and(this.where(input), ...conditions)!;
    const rowsQuery = this.db
      .select({
        internalFieldSortValue: fieldSort?.value ?? sql`null`,
        ...getTableColumns(lead),
        companyName: company.name, companyDomain: company.domain,
        ownerName: user.name, ownerEmail: user.email,
        sourceLabel: leadSource.label, sourceLabelKey: leadSource.labelKey,
        statusLabel: leadStatus.label, statusLabelKey: leadStatus.labelKey, statusMeaning: leadStatus.meaning,
        collaboratorMembershipIds: sql<string>`(select coalesce(json_group_array(membership_id), '[]') from lead_collaborator where lead_id = ${lead.id})`,
        collaboratorLabels: sql<string>`(select coalesce(json_group_object(u.id,u.name), '{}') from lead_collaborator lc join user u on u.id=lc.membership_id where lc.lead_id=${lead.id})`,
      })
      .from(lead)
      .innerJoin(leadSource, eq(leadSource.id, lead.sourceId))
      .innerJoin(leadStatus, eq(leadStatus.id, lead.statusId))
      .leftJoin(company, eq(company.id, lead.companyId))
      .leftJoin(user, eq(user.id, lead.ownerMembershipId))
      .where(where)
      .orderBy(...(fieldSort?.order ?? [this.order(input.sort, input.dir)]), asc(lead.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const countQuery = this.db
      .select({ total: sql<number>`count(*)` })
      .from(lead)
      .where(where);
    const facetWhere = and(this.where({ ...input, owner: [], company: [], source: [], status: [], collaborator: [], fields: {} }), ...conditions)!;
    assertQueryLimits(rowsQuery, countQuery);
    const [rows, [{ total }], facets] = await Promise.all([
      rowsQuery,
      countQuery,
      this.facets(facetWhere),
    ]);
    const fields = await fieldListData(this.db, "lead", rows.map(row => row.id), facetWhere);
    return { rows: rows.map(({ internalFieldSortValue: _sortValue, ...row }) => ({ ...row, fields: fields.fieldsByRecord[row.id] ?? {} })), total, facets, customFields: fields.customFields, fieldFacets: fields.fieldFacets, fieldFileLabels: fields.fieldFileLabels, fieldCustomerLabels: fields.fieldCustomerLabels, fieldUserLabels: fields.fieldUserLabels };
  }

  async byId(id: string) {
    const record = await this.db
      .select({
        ...getTableColumns(lead),
        companyName: company.name, companyDomain: company.domain,
        ownerName: user.name, ownerEmail: user.email,
        sourceLabel: leadSource.label, sourceLabelKey: leadSource.labelKey,
        statusLabel: leadStatus.label, statusLabelKey: leadStatus.labelKey, statusMeaning: leadStatus.meaning,
        collaboratorMembershipIds: sql<string>`(select coalesce(json_group_array(membership_id), '[]') from lead_collaborator where lead_id = ${lead.id})`,
        collaboratorLabels: sql<string>`(select coalesce(json_group_object(u.id,u.name), '{}') from lead_collaborator lc join user u on u.id=lc.membership_id where lc.lead_id=${lead.id})`,
      })
      .from(lead)
      .innerJoin(leadSource, eq(leadSource.id, lead.sourceId))
      .innerJoin(leadStatus, eq(leadStatus.id, lead.statusId))
      .leftJoin(company, eq(company.id, lead.companyId))
      .leftJoin(user, eq(user.id, lead.ownerMembershipId))
      .where(eq(lead.id, id))
      .get();
    if (!record) return null;
    return record;
  }

  async create(values: typeof lead.$inferInsert, context: RequestContext, fields: PreparedRecordFields, creation?: PreparedRecordCreation, collaborators: string[] = []) {
    const op = actionGuard(this.db, context, ["lead.create", ...(values.ownerMembershipId || collaborators.length ? ["lead.assign" as const] : [])]);
    const before = creation?.before ?? [];
    try {
      const results = await this.db.batch([op.begin, ...before, this.db.insert(lead).values(values).returning(), ...this.collaboratorWrites(values.id!, collaborators), ...fields.statements, ...(creation?.after ?? []), op.end]);
      return (results[1 + before.length] as (typeof lead.$inferSelect)[])[0]!;
    } catch (error) { fields.translateError(error); throw error; }
  }
  async update(id: string, values: Partial<typeof lead.$inferInsert>, expectedRevision: number, context: RequestContext, fields: PreparedRecordFields, collaborators?: string[]) {
    const op = actionGuard(this.db, context, ["lead.update", ...(values.ownerMembershipId !== undefined || collaborators !== undefined ? ["lead.assign" as const] : [])]);
    const guardId = crypto.randomUUID();
    try {
      const results = await this.db.batch([op.begin, this.db.update(lead).set({ ...values, revision: sql`${lead.revision}+1` }).where(and(eq(lead.id, id), eq(lead.revision, expectedRevision))).returning(),
      this.db.insert(operationConditionGuard).values({ id: guardId, authorized: sql<number>`case when changes()=1 then 1 else 0 end` }),
      ...(collaborators === undefined ? [] : this.collaboratorWrites(id, collaborators)), ...fields.statements, this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, guardId)), op.end]);
      return (results[1] as (typeof lead.$inferSelect)[])[0]!;
    } catch (error) { fields.translateError(error); throw error; }
  }
  private collaboratorWrites(id: string, members: string[]) {
    return [this.db.delete(leadCollaborator).where(eq(leadCollaborator.leadId, id)),
    ...(members.length ? [this.db.insert(leadCollaborator).values(members.map(membershipId => ({ leadId: id, membershipId })))] : [])];
  }
  async archive(id: string, archivedAt: Date | null, context: RequestContext) {
    const rows = await authorizedWrite(this.db, context, [archivedAt ? "lead.archive" : "lead.restore"], this.db.update(lead).set({ archivedAt, revision: sql`${lead.revision}+1`, updatedAt: new Date() }).where(eq(lead.id, id)).returning());
    return rows[0];
  }
  async bulkArchive(ids: string[], archivedAt: Date | null, context: RequestContext) {
    const result = await authorizedWrite(this.db, context, [archivedAt ? "lead.archive" : "lead.restore"], this.db.update(lead).set({ archivedAt, revision: sql`${lead.revision}+1`, updatedAt: new Date() }).where(inJsonArray(lead.id, ids)));
    return result.meta.changes;
  }
  private async facets(where: SQL) {
    const [source, status, owner, collaborator, companies] = await Promise.all([
      this.db.select({ value: lead.sourceId, label: sql<string>`coalesce(${leadSource.label},${leadSource.labelKey})`, count: sql<number>`count(*)` }).from(lead).innerJoin(leadSource, eq(leadSource.id, lead.sourceId)).where(where).groupBy(lead.sourceId),
      this.db.select({ value: lead.statusId, label: sql<string>`coalesce(${leadStatus.label},${leadStatus.labelKey})`, count: sql<number>`count(*)` }).from(lead).innerJoin(leadStatus, eq(leadStatus.id, lead.statusId)).where(where).groupBy(lead.statusId),
      this.db.select({ value: sql<string>`coalesce(${lead.ownerMembershipId},'unassigned')`, label: sql<string>`coalesce(${user.name},'common.unassigned')`, count: sql<number>`count(*)` }).from(lead).leftJoin(user, eq(user.id, lead.ownerMembershipId)).where(where).groupBy(lead.ownerMembershipId),
      this.db.select({ value: leadCollaborator.membershipId, label: user.name, count: sql<number>`count(*)` }).from(lead).innerJoin(leadCollaborator, eq(leadCollaborator.leadId, lead.id)).innerJoin(user, eq(user.id, leadCollaborator.membershipId)).where(where).groupBy(leadCollaborator.membershipId),
      this.db.select({ value: company.id, label: company.name, count: sql<number>`count(*)` }).from(lead).innerJoin(company, eq(company.id, lead.companyId)).where(where).groupBy(company.id),
    ]);
    return { source, status, owner, collaborator, company: companies };
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
  private where(input: LeadListInput): SQL<unknown> {
    const conditions: SQL<unknown>[] = [
      ...fieldFilterConditions("lead", input.fields),
      input.archived
        ? isNotNull(lead.archivedAt)
        : isNull(lead.archivedAt),
    ];
    if (input.q)
      conditions.push(
        or(
          like(lead.firstName, `%${input.q}%`),
          like(lead.lastName, `%${input.q}%`),
          like(lead.email, `%${input.q}%`),
          like(lead.title, `%${input.q}%`),
        )!,
      );
    if (input.source.length) conditions.push(inJsonArray(lead.sourceId, input.source));
    if (input.status.length) conditions.push(inJsonArray(lead.statusId, input.status));
    if (input.collaborator.length) conditions.push(sql`exists(select 1 from lead_collaborator where lead_id=${lead.id} and ${inJsonArray(sql`membership_id`, input.collaborator)})`);
    if (input.company.length)
      conditions.push(inJsonArray(lead.companyId, input.company));
    if (input.owner.length) {
      const assigned = input.owner.filter((id) => id !== "unassigned");
      conditions.push(
        input.owner.includes("unassigned")
          ? assigned.length
            ? or(
              inJsonArray(lead.ownerMembershipId, assigned),
              isNull(lead.ownerMembershipId),
            )!
            : isNull(lead.ownerMembershipId)
          : inJsonArray(lead.ownerMembershipId, assigned),
      );
    }
    return and(...conditions)!;
  }

  private order(sort: LeadListInput["sort"], dir: LeadListInput["dir"]) {
    const column =
      sort === "firstName"
        ? lead.firstName
        : sort === "lastName"
          ? lead.lastName
          : sort === "email"
            ? lead.email
            : sort === "title"
              ? lead.title
              : sort === "lastActivityAt"
                ? lead.lastActivityAt
                : sort === "archivedAt"
                  ? lead.archivedAt
                  : lead.createdAt;
    return dir === "desc" ? desc(column) : asc(column);
  }
}
