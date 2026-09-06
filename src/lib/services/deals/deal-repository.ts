import { assertQueryLimits } from "@/lib/db/query-limits";
import { fieldConditionQuery } from "../custom-fields/field-condition-query";
import { customFieldSort } from "../custom-fields/field-sort";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, authorizedWrite, permissionError } from "../permissions/permission-policy";
import { inJsonArray } from "@/lib/db/sql-filters";
import { prepareDealConversion } from "@/lib/services/deals/deal-conversion-write";
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
  crmSetting,
  dealConversion,
  contact,
  deal,
  dealContact,
  dealStage,
  singletonMembership,
  user,
} from "@/lib/db/schema";
import type { DealListInput } from "@/lib/services/deals/deal-contract";

export class DealRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(input: DealListInput) {
    await validateFieldFilters(this.db, "deal", input.fields);
    const fieldSort = await customFieldSort(this.db, "deal", input.sort, input.dir);
    const conditions = await fieldConditionQuery(this.db, "deal", input.criteria);
    const where = and(this.where(input), ...conditions)!;
    const rowsQuery = this.db
      .select({
        internalFieldSortValue: fieldSort?.value ?? sql`null`,
        id: deal.id,
        name: deal.name,
        description: deal.description,
        companyId: deal.companyId,
        companyName: company.name,
        companyDomain: company.domain,
        ownerMembershipId: deal.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        stageId: deal.stageId,
        stageLabelKey: dealStage.labelKey,
        closedState: dealStage.closedState,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        baseAmountMinor: dealConversion.baseAmountMinor,
        baseCurrency: dealConversion.baseCurrency,
        fxRate: dealConversion.fxRate,
        fxRateAt: dealConversion.fxRateAt,
        expectedCloseAt: deal.expectedCloseAt,
        closedAt: deal.closedAt,
        closedReason: deal.closedReason,
        lastActivityAt: deal.lastActivityAt,
        archivedAt: deal.archivedAt,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      })
      .from(deal)
      .innerJoin(crmSetting, eq(crmSetting.id, "settings"))
      .leftJoin(dealConversion, and(eq(dealConversion.dealId,deal.id),eq(dealConversion.version,crmSetting.activeConversionVersion),eq(dealConversion.moneyRevision,deal.moneyRevision)))
      .innerJoin(company, eq(company.id, deal.companyId))
      .innerJoin(dealStage, eq(dealStage.id, deal.stageId))
      .innerJoin(user, eq(user.id, deal.ownerMembershipId))
      .where(where)
      .orderBy(...(fieldSort?.order ?? [...(input.sort === "amount" ? [asc(sql`${dealConversion.baseAmountMinor} is null`)] : []), this.order(input.sort, input.dir)]), asc(deal.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const countQuery = this.db
      .select({ total: sql<number>`count(*)` })
      .from(deal)
      .where(where);
    const facetWhere = and(this.where({ ...input, owner: [], company: [], stage: [], fields: {} }), ...conditions)!;
    assertQueryLimits(rowsQuery, countQuery);
    const [rows, [{ total }], facets] = await Promise.all([
      rowsQuery,
      countQuery,
      listFacets(this.db, "deal", facetWhere),
    ]);
    const fields = await fieldListData(this.db, "deal", rows.map(row => row.id), facetWhere);
    return { rows: rows.map(({ internalFieldSortValue: _sortValue, ...row }) => ({ ...row, fields: fields.fieldsByRecord[row.id] ?? {} })), total, facets, customFields: fields.customFields, fieldFacets: fields.fieldFacets, fieldFileLabels: fields.fieldFileLabels, fieldCustomerLabels: fields.fieldCustomerLabels, fieldUserLabels: fields.fieldUserLabels };
  }

  async byId(id: string) {
    const record = await this.db
      .select({
        id: deal.id,
        name: deal.name,
        description: deal.description,
        companyId: deal.companyId,
        companyName: company.name,
        companyDomain: company.domain,
        ownerMembershipId: deal.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        stageId: deal.stageId,
        stageLabelKey: dealStage.labelKey,
        closedState: dealStage.closedState,
        stageChangedAt: deal.stageChangedAt,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        moneyRevision: deal.moneyRevision,
        baseAmountMinor: dealConversion.baseAmountMinor,
        baseCurrency: dealConversion.baseCurrency,
        fxRate: dealConversion.fxRate,
        fxRateAt: dealConversion.fxRateAt,
        expectedCloseAt: deal.expectedCloseAt,
        closedAt: deal.closedAt,
        closedReason: deal.closedReason,
        lastActivityAt: deal.lastActivityAt,
        archivedAt: deal.archivedAt,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      })
      .from(deal)
      .innerJoin(crmSetting, eq(crmSetting.id, "settings"))
      .leftJoin(dealConversion, and(eq(dealConversion.dealId,deal.id),eq(dealConversion.version,crmSetting.activeConversionVersion),eq(dealConversion.moneyRevision,deal.moneyRevision)))
      .innerJoin(company, eq(company.id, deal.companyId))
      .innerJoin(dealStage, eq(dealStage.id, deal.stageId))
      .innerJoin(user, eq(user.id, deal.ownerMembershipId))
      .where(eq(deal.id, id))
      .get();
    if (!record) return null;
    const contacts = await this.db
      .select({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        title: contact.title,
        role: dealContact.role,
      })
      .from(dealContact)
      .innerJoin(contact, eq(contact.id, dealContact.contactId))
      .where(eq(dealContact.dealId, id))
      .orderBy(asc(contact.firstName), asc(contact.lastName), asc(contact.id));
    return { ...record, contacts };
  }

  async create(values: typeof deal.$inferInsert, context: RequestContext) {
    const fx = await prepareDealConversion(this.db,{id:values.id,amountMinor:values.amountMinor ?? null,currency:values.currency ?? "USD",moneyRevision:0});
    const op = actionGuard(this.db, context, ["deal.create", "deal.assign"]);
    try {
      const results = await this.db.batch([op.begin,fx.guard,this.db.insert(deal).values(values).returning(),fx.conversion,fx.finish,op.end]);
      return results[2][0]!;
    } catch (error) { permissionError(error); }
  }
  async updateWithHistory(id: string, values: Partial<typeof deal.$inferInsert>, expectedStage: string, authorId: string, context: RequestContext, expectedMoney?: {revision:number;amountMinor:number|null;currency:string}) {
    const changedStage = values.stageId !== undefined && values.stageId !== expectedStage;
    const now = values.updatedAt ?? new Date();
    const query = this.db.update(deal).set({
      ...values,
      ...(changedStage ? { lastActivityAt: sql`max(coalesce(${deal.lastActivityAt}, 0), ${now.getTime()})` } : {}),
    }).where(and(eq(deal.id, id), eq(deal.stageId, expectedStage))).returning({ id: deal.id, name: deal.name }).toSQL();
    const update = this.db.$client.prepare(query.sql).bind(...query.params);
    const fx = expectedMoney ? await prepareDealConversion(this.db,{id,amountMinor:values.amountMinor === undefined ? expectedMoney.amountMinor : values.amountMinor,currency:values.currency ?? expectedMoney.currency,moneyRevision:expectedMoney.revision+1},sql`exists(select 1 from deal where id=${id} and stage_id=${expectedStage} and money_revision=${expectedMoney.revision})`) : undefined;
    const prepared = (statement: {toSQL():{sql:string;params:unknown[]}}) => { const query=statement.toSQL(); return this.db.$client.prepare(query.sql).bind(...query.params); };
    const op = actionGuard(this.db, context, ["deal.update", ...(values.ownerMembershipId !== undefined ? ["deal.assign" as const] : [])]);
    const auditId = crypto.randomUUID();
    // changes() refers to the preceding guarded UPDATE on the same batch connection.
    // A stale stage therefore produces neither history nor related-record stamps.
    let result;
    try { result = await this.db.$client.batch([
      prepared(op.begin),
      ...(fx ? [prepared(fx.guard)] : []),
      update,
      ...(changedStage ? [
      this.db.$client.prepare(`INSERT INTO activity
        (id, type, company_id, deal_id, author_user_id, metadata_json, occurred_at, created_at, updated_at)
        SELECT ?, 'stage_change', company_id, id, ?, json_object('fromStageId', ?, 'toStageId', ?), ?, ?, ?
        FROM deal WHERE id = ? AND changes() = 1`)
        .bind(auditId, authorId, expectedStage, values.stageId, now.getTime(), now.getTime(), now.getTime(), id),
      this.db.$client.prepare(`UPDATE company SET last_activity_at = max(coalesce(last_activity_at, 0), ?), updated_at = ?
        WHERE id = (SELECT company_id FROM activity WHERE id = ?)`)
        .bind(now.getTime(), now.getTime(), auditId),
      ] : []),
      ...(fx ? [prepared(fx.conversion),prepared(fx.finish)] : []),
      prepared(op.end),
    ]); } catch (error) { permissionError(error); }
    return result[fx ? 2 : 1]!.results[0] as { id: string; name: string } | undefined;
  }
  async archive(id: string, archivedAt: Date | null, context: RequestContext) {
    const rows = await authorizedWrite(this.db, context, [archivedAt ? "deal.archive" : "deal.restore"], this.db.update(deal).set({ archivedAt, updatedAt: new Date() }).where(eq(deal.id, id)).returning());
    return rows[0];
  }
  async bulkArchive(ids: string[], archivedAt: Date | null, context: RequestContext) {
    const result = await authorizedWrite(this.db, context, [archivedAt ? "deal.archive" : "deal.restore"], this.db.update(deal).set({ archivedAt, updatedAt: new Date() }).where(inJsonArray(deal.id, ids)));
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
  contact(id: string) {
    return this.db.query.contact.findFirst({ where: eq(contact.id, id) });
  }
  stage(id: string) {
    return this.db.query.dealStage.findFirst({ where: eq(dealStage.id, id) });
  }
  async attachContact(dealId: string, contactId: string, role: string | null, context: RequestContext) {
    const rows = await authorizedWrite(this.db, context, ["deal.update"], this.db.insert(dealContact).values({ dealId, contactId, role }).returning());
    return rows[0]!;
  }
  async setContactRole(dealId: string, contactId: string, role: string | null, context: RequestContext) {
    const rows = await authorizedWrite(this.db, context, ["deal.update"], this.db.update(dealContact).set({ role }).where(and(eq(dealContact.dealId, dealId), eq(dealContact.contactId, contactId))).returning());
    return rows[0];
  }
  async detachContact(dealId: string, contactId: string, context: RequestContext) {
    const rows = await authorizedWrite(this.db, context, ["deal.update"], this.db.delete(dealContact).where(and(eq(dealContact.dealId, dealId), eq(dealContact.contactId, contactId))).returning());
    return rows[0];
  }
  async hasIncompatibleContact(dealId: string, companyId: string) {
    const row = await this.db
      .select({ id: contact.id })
      .from(dealContact)
      .innerJoin(contact, eq(contact.id, dealContact.contactId))
      .where(
        and(
          eq(dealContact.dealId, dealId),
          or(
            sql`${contact.companyId} IS NULL`,
            sql`${contact.companyId} != ${companyId}`,
          )!,
        ),
      )
      .limit(1);
    return row.length > 0;
  }

  private where(input: DealListInput): SQL<unknown> {
    const conditions: SQL<unknown>[] = [
      ...fieldFilterConditions("deal", input.fields),
      input.archived ? isNotNull(deal.archivedAt) : isNull(deal.archivedAt),
    ];
    if (input.q)
      conditions.push(
        or(
          like(deal.name, `%${input.q}%`),
          like(deal.description, `%${input.q}%`),
        )!,
      );
    if (input.stage.length) conditions.push(inJsonArray(deal.stageId, input.stage));
    if (input.company.length)
      conditions.push(inJsonArray(deal.companyId, input.company));
    if (input.owner.length)
      conditions.push(inJsonArray(deal.ownerMembershipId, input.owner));
    return and(...conditions)!;
  }

  private order(sort: DealListInput["sort"], dir: DealListInput["dir"]) {
    const column =
      sort === "name"
        ? deal.name
        : sort === "stage"
          ? deal.stageId
          : sort === "amount"
            ? dealConversion.baseAmountMinor
            : sort === "expectedCloseAt"
              ? deal.expectedCloseAt
              : sort === "lastActivityAt"
                ? deal.lastActivityAt
                : sort === "archivedAt"
                  ? deal.archivedAt
                  : deal.createdAt;
    return dir === "desc" ? desc(column) : asc(column);
  }
}
